import { RequestInfo } from './base/RequestInfo';

const ITEM_FIELDS = [
    { key: 'mrkt_div_cls_code' },
    { key: 'shrn_iscd' },
    { key: 'exch_cls_code' },
    { key: 'ldate' },
    { key: 'color' },
] as const;

const INPUT_SCHEMA = [
    {
        blockId: 'InBlock1',
        type: 'single',
        fields: [
            { key: 'usid' },
            { key: 'wk_tp' },
            { key: 'grpnum' },
            { key: 'grpname' },
            { key: 'arr_cnt' },
        ],
    },
    { blockId: 'InBlock2', type: 'array', fields: ITEM_FIELDS },
] as const;

const OUTPUT_SCHEMA = [
    {
        blockId: 'OutBlock1',
        type: 'single',
        fields: [{ key: 'grpnum' }, { key: 'grpname' }, { key: 'arr_cnt' }],
    },
    {
        blockId: 'OutBlock2',
        type: 'array',
        fields: [...ITEM_FIELDS, { key: 'folder_yn' }],
    },
] as const;

export interface CCS20000OutBlock2 {
    mrkt_div_cls_code?: string;
    shrn_iscd?: string;
    exch_cls_code?: string;
    ldate?: string;
    color?: string;
    folder_yn?: string;
}

export class CCS20000Request extends RequestInfo {
    protected apiName = 'CCS20000';
    protected inputSchema = INPUT_SCHEMA;
    protected outputSchema = OUTPUT_SCHEMA;

    public request = {
        inblock1: {
            usid: '',
            wk_tp: '3',
            grpnum: '',
            grpname: '',
            arr_cnt: '',
        },
        inblock2: [] as Array<Record<string, string>>,
    };
}
