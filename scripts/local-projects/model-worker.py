"""Single offline Magi or SAM process, bounded by the workbench supervisor."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
from model_contract import checked_path, validate_request, proposals, require_headroom, public_failure, WorkerFailure

PROJECT = Path(os.environ['LOCAL_MODEL_PROJECT']).resolve()
DATA = Path(os.environ['LOCAL_ASSISTANCE_DATA']).resolve()
MAGI = PROJECT / 'experiments/magi-evaluation'
SAM = PROJECT / 'experiments/segmentation-poc'
MAGI_PIN = '49c73a225122d53adbaa26d53868be81a57706e2'
SAM_PIN = 'ee5bba1d82bb8749febdf90f45e84b687142ba03'


def digest(path):
    result=hashlib.sha256()
    with path.open('rb') as file:
        while block:=file.read(8*1024*1024):
            result.update(block)
    return result.hexdigest()


def verify(path, expected):
    if digest(path) != expected:
        raise RuntimeError(f'Pinned artifact hash mismatch: {path.name}')


def jsonable(value):
    if isinstance(value,dict): return {str(k):jsonable(v) for k,v in value.items()}
    if isinstance(value,(list,tuple)): return [jsonable(v) for v in value]
    if hasattr(value,'detach'): return value.detach().cpu().tolist()
    if hasattr(value,'tolist'): return value.tolist()
    return value


def write(path,value):
    with path.open('x') as output:
        json.dump(jsonable(value),output,indent=2,ensure_ascii=False,allow_nan=False)
        output.write('\n')


def memory_snapshot():
    entries=dict(line.split(':',1) for line in Path('/proc/meminfo').read_text().splitlines())
    host=int(entries['MemAvailable'].strip().split()[0])*1024
    result=subprocess.run(['nvidia-smi','--id=0','--query-gpu=memory.free','--format=csv,noheader,nounits'],capture_output=True,text=True,timeout=5,check=True)
    gpu=int(result.stdout.strip())*1024**2
    return {'host_available_bytes':host,'gpu_free_bytes':gpu,'sampling':'stage boundary, not total peak'}


def offline(output):
    sys.dont_write_bytecode=True
    values={'HF_HUB_OFFLINE':'1','TRANSFORMERS_OFFLINE':'1','HF_DATASETS_OFFLINE':'1','HF_HUB_DISABLE_IMPLICIT_TOKEN':'1','TOKENIZERS_PARALLELISM':'false','TORCH_FORCE_WEIGHTS_ONLY_LOAD':'1','PYTHONDONTWRITEBYTECODE':'1'}
    for key in ('HF_HOME','HF_HUB_CACHE','HF_MODULES_CACHE','MPLCONFIGDIR','TORCH_HOME','XDG_CACHE_HOME'):
        values[key]=str(output/'cache'/key.lower())
    os.environ.update(values)


def verify_magi():
    folder=MAGI/'model-cache/magiv3'/MAGI_PIN
    gate=json.loads((MAGI/'audit/execution-gate.json').read_text())['v3']
    if gate['revision'] != MAGI_PIN or not gate['code_gate'].startswith('GO'):
        raise RuntimeError('Magi audit gate does not authorize this revision')
    manifest=json.loads((MAGI/'audit/source-manifest.json').read_text())['magiv3']
    if manifest['revision'] != MAGI_PIN: raise RuntimeError('Magi source revision mismatch')
    for name,item in manifest['files'].items():
        if Path(name).name != name: raise RuntimeError('Invalid source manifest file')
        verify(folder/name,item['sha256'])
    record=next(r for r in json.loads((MAGI/'model-cache/download-manifest.json').read_text())['models'] if r['repository']=='ragavsachdeva/magiv3')
    if record['revision'] != MAGI_PIN: raise RuntimeError('Magi model revision mismatch')
    for item in record['files']:
        if Path(item['file']).name != item['file']: raise RuntimeError('Invalid model file')
        verify(folder/item['file'],item['sha256'])
    return folder


def detect(request,report):
    folder=verify_magi()
    import torch
    import transformers
    from transformers import AutoModelForCausalLM,AutoProcessor
    from PIL import Image
    if transformers.__version__ != '4.49.0' or tuple(map(int,torch.__version__.split('+')[0].split('.')[:2])) < (2,10):
        raise RuntimeError('Use the existing audited Magi environment with Transformers 4.49 and patched Torch')
    if not torch.cuda.is_available(): raise RuntimeError('CUDA unavailable; no implicit CPU fallback')
    report.update(model='ragavsachdeva/magiv3',revision=MAGI_PIN,preprocessing='source RGB converted L then RGB, matching the prior smoke configuration, not proven optimal',settings={'batchSize':1,'dtype':'float16','attention':'eager','maxNewTokens':1024,'numBeams':3,'doSample':False})
    torch.cuda.reset_peak_memory_stats()
    model=AutoModelForCausalLM.from_pretrained(str(folder),trust_remote_code=True,local_files_only=True,use_safetensors=True,torch_dtype=torch.float16,attn_implementation='eager').cuda().eval()
    processor=AutoProcessor.from_pretrained(str(folder),trust_remote_code=True,local_files_only=True)
    image=Image.open(request['sourcePath']).convert('L').convert('RGB')
    with torch.inference_mode():
        raw=jsonable(model.predict_detections_and_associations([image],processor)[0])
        ocr=jsonable(model.predict_ocr([image],processor)[0])
    torch.cuda.synchronize()
    regions,issues=proposals(raw,request['width'],request['height'])
    report.update(raw={'detections':raw,'ocr':ocr},regions=regions,issues=issues+['Magi proposals do not identify intended motion; review all text protection and fine parts'])
    report['metrics'].update(cudaPeakAllocatedBytes=torch.cuda.max_memory_allocated(),cudaPeakReservedBytes=torch.cuda.max_memory_reserved(),torch=torch.__version__,transformers=transformers.__version__)


def verify_sam():
    folder=SAM/'model-cache'/SAM_PIN
    manifest=json.loads((SAM/'audit/model-manifest.json').read_text())
    if manifest['revision'] != SAM_PIN: raise RuntimeError('SAM revision mismatch')
    for item in manifest['files']:
        if Path(item['file']).name != item['file']: raise RuntimeError('Invalid SAM manifest path')
        verify(folder/item['file'],item['sha256'])
    return folder


def segment(request,report):
    folder=verify_sam()
    import torch
    import transformers
    import numpy as np
    from PIL import Image
    from transformers import Sam2Model,Sam2Config,Sam2Processor
    if not transformers.__version__.startswith('4.57.') or tuple(map(int,torch.__version__.split('+')[0].split('.')[:2])) < (2,10):
        raise RuntimeError('Use existing SAM environment with Transformers 4.57 and patched Torch')
    if not torch.cuda.is_available() or not torch.cuda.is_bf16_supported(): raise RuntimeError('CUDA BF16 required; no implicit fallback')
    report.update(model='facebook/sam2.1-hiera-small',revision=SAM_PIN,preprocessing='original RGB',settings={'imageBatchSize':1,'objectBatchSize':1,'multimaskOutput':False,'maskThreshold':0,'dtype':'float32','autocast':'bfloat16','attention':'eager','cleanup':False})
    config_data=json.loads((folder/'config.json').read_text())
    config_data.update(model_type='sam2',architectures=['Sam2Model'])
    torch.cuda.reset_peak_memory_stats()
    model,info=Sam2Model.from_pretrained(folder,config=Sam2Config.from_dict(config_data),local_files_only=True,trust_remote_code=False,use_safetensors=True,output_loading_info=True,attn_implementation='eager')
    video_prefixes=('mask_downsample.','memory_attention.','memory_encoder.','memory_temporal_positional_encoding','no_memory_positional_encoding','no_object_pointer','object_pointer_proj.','occlusion_spatial_embedding_parameter','temporal_positional_encoding_projection_layer.')
    if info['missing_keys'] or info['mismatched_keys'] or info['error_msgs'] or any(not k.startswith(video_prefixes) for k in info['unexpected_keys']):
        raise RuntimeError('SAM image model weights are incomplete or incompatible')
    report['loadingInfo']=info
    model=model.cuda().eval()
    processor=Sam2Processor.from_pretrained(folder,local_files_only=True,trust_remote_code=False)
    image=Image.open(request['sourcePath']).convert('RGB')
    pixels=processor(images=image,return_tensors='pt')['pixel_values'].cuda()
    with torch.inference_mode(),torch.autocast('cuda',dtype=torch.bfloat16):
        embeddings=model.get_image_embeddings(pixels)
    report['regions']=[]
    for region in request['regions']:
        kwargs={'input_boxes':[[region['bbox']]]}
        if region['points']:
            kwargs.update(input_points=[[[[p['x'],p['y']] for p in region['points']]]],input_labels=[[[p['label'] for p in region['points']]]])
        inputs=processor(images=image,return_tensors='pt',**kwargs)
        model_inputs={k:inputs[k].cuda() for k in ('input_points','input_labels','input_boxes') if k in inputs}
        with torch.inference_mode(),torch.autocast('cuda',dtype=torch.bfloat16):
            output=model(image_embeddings=embeddings,multimask_output=False,**model_inputs)
        torch.cuda.synchronize()
        mask=processor.post_process_masks(output.pred_masks.float().cpu(),inputs['original_sizes'],mask_threshold=0.,max_hole_area=0.,max_sprinkle_area=0.,apply_non_overlapping_constraints=False)[0][0,0].numpy()
        if mask.shape != (request['height'],request['width']): raise RuntimeError('SAM mask dimensions differ from source')
        path=request['outputDir']/f"{region['id']}-mask.png"
        with path.open('xb') as target: Image.fromarray(mask.astype(np.uint8)*255).save(target,format='PNG')
        area=int(np.count_nonzero(mask))
        issues=['Unreviewed model mask; inspect background leakage, overlaps and text before enabling motion']
        if not area: issues.append('Empty mask; keep this region static')
        report['regions'].append({**region,'maskPath':path.name,'maskSha256':digest(path),'areaPixels':area,'predictedIouScore':float(output.iou_scores.float().cpu().flatten()[0]),'issues':issues,'reviewRequired':True})
    report['metrics'].update(cudaPeakAllocatedBytes=torch.cuda.max_memory_allocated(),cudaPeakReservedBytes=torch.cuda.max_memory_reserved(),torch=torch.__version__,transformers=transformers.__version__)


def validate_layout(request_path, source, output, data):
    import uuid
    rel_request=checked_path(request_path,data).relative_to(data)
    rel_source=checked_path(source,data).relative_to(data)
    rel_output=checked_path(output,data).relative_to(data)
    if len(rel_source.parts)!=3 or rel_source.parts[0]!='projects' or rel_source.parts[2]!='source.png':
        raise ValueError('Source must be the current normalized project source.png')
    if len(rel_request.parts)!=3 or rel_request.parts[0]!='jobs' or len(rel_output.parts)!=3 or rel_output.parts[0]!='jobs' or rel_request.parts[1]!=rel_output.parts[1]:
        raise ValueError('Request and fresh output must belong to one server-owned job')
    for value in (rel_source.parts[1],rel_request.parts[1]):
        if str(uuid.UUID(value)) != value:
            raise ValueError('Project and job IDs must be canonical UUIDs')


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('mode',choices=['detect','segment'])
    parser.add_argument('--request',required=True)
    args=parser.parse_args()
    request_path=checked_path(args.request,DATA)
    if request_path.stat().st_size>65536: raise ValueError('Request too large')
    request=validate_request(json.loads(request_path.read_text()),args.mode,DATA)
    validate_layout(request_path,request['sourcePath'],request['outputDir'],DATA)
    request['outputDir'].mkdir(parents=False,exist_ok=False)
    offline(request['outputDir'])
    report={'schemaVersion':1,'status':'started','mode':args.mode,'provenance':'live-local-inference','source':{'sha256':request['sha256'],'width':request['width'],'height':request['height']},'automaticRetries':0,'reviewRequired':True,'regions':[],'metrics':{},'network':'offline, local audited weights only'}
    started=time.monotonic()
    def timeout(*_): raise TimeoutError('Worker exceeded 240 seconds; no retry')
    signal.signal(signal.SIGALRM,timeout)
    signal.setitimer(signal.ITIMER_REAL,240)
    code=0
    try:
        try: before=memory_snapshot()
        except Exception as error: raise WorkerFailure('resource_check_failed') from error
        report['metrics']['before']=before
        require_headroom(before['host_available_bytes'],before['gpu_free_bytes'])
        (detect if args.mode=='detect' else segment)(request,report)
        report['status']='completed'
    except Exception as error:
        report.update(status='failed-no-retry',error=f'{type(error).__name__}: {error}')
        report['publicFailure']=public_failure(error)
        print('WORKBENCH_FAILURE:'+json.dumps(report['publicFailure']),flush=True)
        code=1
    finally:
        signal.setitimer(signal.ITIMER_REAL,0)
        report['metrics']['seconds']=time.monotonic()-started
        try: report['metrics']['after']=memory_snapshot()
        except Exception: report['metrics']['after']=None
        write(request['outputDir']/'result.json',report)
    print(json.dumps({'status':report['status'],'result':str(request['outputDir']/'result.json')}),flush=True)
    return code

if __name__=='__main__':
    sys.exit(main())
