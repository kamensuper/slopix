"""Serial/QMP is a byte stream: only parse newline-terminated telemetry records."""
import re
FIELDS={'fps10','frame_us','render_us','compose_us','upload_us','frames'}
def parse_cube_stats(text):
    records=[]
    for line in text.split('\n')[:-1]:
        if not line.startswith('CUBE_STATS '):continue
        record={k:int(v) for k,v in re.findall(r'(\w+)=(\d+)',line)}
        assert set(record)==FIELDS, 'Malformed complete telemetry record: '+line
        records.append(record)
    return records
if __name__=='__main__':
    line='CUBE_STATS fps10=600 frame_us=16666 render_us=2500 compose_us=2000 upload_us=500 frames=120'
    for i in range(len(line)+1):assert parse_cube_stats(line[:i])==[]
    assert parse_cube_stats(line+'\n')[0]['frames']==120
    try:parse_cube_stats('CUBE_STATS fps10=600\n')
    except AssertionError:pass
    else:raise AssertionError('malformed record accepted')
    print('PASS: partial telemetry records wait for newline; malformed complete records fail')
