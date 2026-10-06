"""Strict, GPU-independent boundaries for reviewed local image proposals."""
import hashlib
import math
from pathlib import Path
import re


def checked_path(value, root):
    path, root = Path(value), Path(root).resolve()
    if not path.is_absolute() or '..' in path.parts or not path.resolve().is_relative_to(root):
        raise ValueError('Path must remain within the workbench project data root')
    for parent in (path, *path.parents):
        if parent.is_symlink():
            raise ValueError('Symlink paths are not accepted')
        if parent == root:
            break
    return path


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def bbox(value, width, height):
    if not isinstance(value, list) or len(value) != 4 or not all(finite(v) for v in value):
        raise ValueError('Expected four finite bounding-box coordinates')
    x0,y0,x1,y1 = value
    if not (0 <= x0 < x1 <= width and 0 <= y0 < y1 <= height):
        raise ValueError('Bounding box is empty or outside the source')
    return list(value)


def validate_request(request, mode, root):
    from PIL import Image
    if not isinstance(request, dict) or mode not in ('detect', 'segment'):
        raise ValueError('Invalid request or mode')
    source = checked_path(request['sourcePath'], root)
    output = checked_path(request['outputDir'], root)
    if output.exists():
        raise ValueError('Output directory already exists; overwrites and retries are refused')
    if not source.is_file() or source.suffix.lower() != '.png' or source.stat().st_size > 10*1024*1024:
        raise ValueError('Source must be a bounded normalized PNG')
    with Image.open(source) as image:
        width, height = image.size
        if image.format != 'PNG' or image.mode not in ('RGB','RGBA') or getattr(image, 'n_frames', 1) != 1:
            raise ValueError('Expected one normalized RGB/RGBA PNG')
        if not (1 <= width <= 1280 and 1 <= height <= 1280 and width*height <= 1700000):
            raise ValueError('Source exceeds normalized image bounds')
        image.verify()
    regions = request.get('regions', [])
    if not isinstance(regions,list) or len(regions)>16 or (mode == 'segment' and not regions):
        raise ValueError('Segmentation requires 1–16 regions')
    ids=set()
    clean=[]
    for region in regions:
        identifier=region.get('id','')
        if not isinstance(identifier,str) or not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}', identifier) or identifier in ids:
            raise ValueError('Invalid or duplicate region ID')
        ids.add(identifier)
        label=region.get('label',identifier)
        if not isinstance(label,str) or len(label)>120:
            raise ValueError('Invalid region label')
        kind=region.get('kind','manual')
        if kind not in ('character','text','manual','part','object','tail','panel'):
            raise ValueError('Invalid region kind')
        box=bbox(region['bbox'],width,height)
        points=region.get('points',[])
        if not isinstance(points,list) or len(points)>10:
            raise ValueError('At most ten points per region')
        for point in points:
            if not isinstance(point,dict) or not finite(point.get('x')) or not finite(point.get('y')) or not 0<=point['x']<width or not 0<=point['y']<height or type(point.get('label')) is not int or point['label'] not in (0,1):
                raise ValueError('Invalid manual point')
        clean.append({'id':identifier,'label':label,'kind':kind,'bbox':box,'points':points,'reviewRequired':True})
    return {'sourcePath':source,'outputDir':output,'width':width,'height':height,'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'regions':clean}


def proposals(raw, width, height):
    regions,issues=[],[]
    for key,kind in [('characters','character'),('texts','text')]:
        values=raw.get(key,[])
        if not isinstance(values,list):
            issues.append(f'{key}: malformed predictions, review raw output')
            continue
        if len(values)>8:
            issues.append(f'{key}: proposal cap of eight reached; remaining raw detections retained')
        for index,value in enumerate(values[:8]):
            try:
                box=bbox(value,width,height)
            except ValueError:
                issues.append(f'{key}[{index}]: invalid geometry; raw detection retained, not silently clamped')
                continue
            regions.append({'id':f'{kind}-{index+1}','label':f'{kind.title()} {index+1}','kind':kind,'bbox':box,'reviewRequired':True,'issues':['Model proposal, not a human-validated part mask'] + (['Text detection may omit balloon, pointer, labels or sound effects; keep original lettering'] if kind=='text' else ['Object detection does not infer anatomy, identity or intended motion'])})
    return regions,issues


class WorkerFailure(RuntimeError):
    def __init__(self,code,**metrics):
        super().__init__(code)
        self.public_failure={'code':code,**metrics}


def public_failure(error):
    """Only structured codes and numeric measurements cross the UI boundary."""
    if isinstance(error,WorkerFailure): return error.public_failure
    if isinstance(error,(FileNotFoundError,ModuleNotFoundError)): return {'code':'local_assets_missing'}
    if isinstance(error,TimeoutError): return {'code':'timeout'}
    message=str(error)
    if 'out of memory' in message.lower(): return {'code':'out_of_memory'}
    if message.startswith(('Use the existing audited Magi environment','Use existing SAM environment')): return {'code':'runtime_incompatible'}
    if message.startswith(('CUDA unavailable','CUDA BF16 required')): return {'code':'gpu_unavailable'}
    if message.startswith(('Pinned artifact hash mismatch','Magi audit gate','Magi source revision mismatch','Magi model revision mismatch','SAM revision mismatch','SAM image model weights')): return {'code':'model_integrity'}
    return {'code':'worker_failed'}


def require_headroom(host_bytes,gpu_bytes):
    if host_bytes < 3.5*1024**3 or gpu_bytes < 3*1024**3:
        raise WorkerFailure('insufficient_memory',hostAvailableBytes=host_bytes,gpuFreeBytes=gpu_bytes,hostRequiredBytes=int(3.5*1024**3),gpuRequiredBytes=3*1024**3)
