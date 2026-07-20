import { RequestInfo } from './base/RequestInfo';

const INPUT_SCHEMA = [
    {
        blockId: 'InBlock1',
        type: 'single',
        fields: [{ key: 'usid' }, { key: 'wk_tp' }, { key: 'arr_cnt' }],
    },
    {
        blockId: 'InBlock2',
        type: 'array',
        fields: [{ key: 'grpnum' }, { key: 'grpname' }],
    },
] as const;

const OUTPUT_SCHEMA = [
    {
        blockId: 'OutBlock1',
        type: 'single',
        fields: [{ key: 'arr_cnt' }],
    },
    {
        blockId: 'OutBlock2',
        type: 'array',
        fields: [{ key: 'grpnum' }, { key: 'grpname' }, { key: 'tot_jongcnt' }],
    },
] as const;

export interface CCS20001OutBlock2 {
    grpnum?: string;
    grpname?: string;
    tot_jongcnt?: string;
}

export class CCS20001Request extends RequestInfo {
    protected apiName = 'CCS20001';
    protected inputSchema = INPUT_SCHEMA;
    protected outputSchema = OUTPUT_SCHEMA;

    public request = {
        inblock1: { usid: '', wk_tp: '4', arr_cnt: '' },
        inblock2: [] as Array<{ grpnum: string; grpname: string }>,
    };
}
