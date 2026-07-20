import { getRequiredTrSpec } from '@/infra/networking/trSpec';

import { RealRequestInfo } from '../base/RealRequestInfo';
import { RequestInfo, type SchemaBlock } from '../base/RequestInfo';

export interface WatchlistSnapshotInput {
    code: string;
    marketCode: string;
    exchangeCode: string;
    isDelayed: boolean;
    registeredDate: string;
}

const SNAPSHOT_OUTPUT_KEYS = [
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '11',
    '13',
    '14',
    '15',
    '16',
    '1',
    '413',
    '414',
    '10',
    '1171',
    '2523',
    '2524',
    '2913',
] as const;

export class WatchlistSnapshotRequest extends RequestInfo {
    protected apiName = 'GD5001QK';
    protected inputSchema = [
        {
            blockId: 'InBlock1',
            type: 'array',
            fields: [
                { key: '9002' },
                { key: '9001' },
                { key: '9241' },
                { key: '9246' },
                { key: '9034' },
            ],
        },
    ] as const;
    protected outputSchema: ReadonlyArray<SchemaBlock> = [
        {
            blockId: 'OutBlock1',
            type: 'array',
            fields: SNAPSHOT_OUTPUT_KEYS.map(key => ({ key })),
        },
    ];

    public request: {
        inblock1: Array<Record<string, string>>;
    };

    constructor(inputs: readonly WatchlistSnapshotInput[]) {
        super();
        if (inputs.length === 0 || inputs.length > 100) {
            throw new Error(
                `[WatchlistSnapshotRequest] 입력 건수는 1~100이어야 합니다: ${inputs.length}`,
            );
        }
        this.request = {
            inblock1: inputs.map(input => ({
                '9002': input.code,
                '9001': input.marketCode,
                '9241': input.exchangeCode,
                '9246': input.isDelayed ? 'Y' : 'N',
                '9034': input.registeredDate,
            })),
        };
    }
}

export interface WatchlistRealRequestOptions {
    apiName: string;
    inputCode: string;
    matchCode: string;
    exchangeCode?: string;
}

export class WatchlistRealRequest extends RealRequestInfo {
    protected apiName: string;
    protected inputSchema: ReadonlyArray<SchemaBlock>;
    protected outputSchema: ReadonlyArray<SchemaBlock>;
    public request: Record<string, unknown>;

    private readonly matchCode: string;
    private readonly exchangeCode: string;
    private readonly outputCodeKey: string;

    constructor(options: WatchlistRealRequestOptions) {
        super();
        const spec = getRequiredTrSpec(options.apiName);
        const inputBlock = spec.blocks.find(block => block.inout === 'in');
        const outputBlock = spec.blocks.find(block => block.inout === 'out');
        if (!inputBlock || !outputBlock || inputBlock.fields.length === 0) {
            throw new Error(
                `[WatchlistRealRequest] ${options.apiName} 입출력 스펙이 올바르지 않습니다.`,
            );
        }

        this.apiName = options.apiName;
        this.matchCode = normalizeCode(options.matchCode);
        this.exchangeCode = normalizeCode(options.exchangeCode ?? '');
        this.outputCodeKey = resolveOutputCodeKey(options.apiName);
        this.inputSchema = [
            {
                blockId: inputBlock.blockId,
                type: inputBlock.occurs ? 'array' : 'single',
                fields: inputBlock.fields.map(field => ({ key: field.key })),
            },
        ];
        this.outputSchema = [
            {
                blockId: outputBlock.blockId,
                type: 'single',
                fields: outputBlock.fields.map(field => ({ key: field.key })),
            },
        ];

        const inputKey = inputBlock.fields[0].key;
        const blockKey = inputBlock.blockId.toLowerCase();
        const inputValue = { [inputKey]: options.inputCode };
        this.request = {
            [blockKey]: inputBlock.occurs ? [inputValue] : inputValue,
        };
    }

    public getMatcherKey(): string {
        return `${this.apiName}:${this.exchangeCode}:${this.matchCode}`;
    }

    public matches(output: Record<string, unknown>): boolean {
        const outBlock = output.OutBlock1 as
            | Record<string, unknown>
            | undefined;
        const outputCode = normalizeCode(outBlock?.[this.outputCodeKey]);
        if (!codesMatch(outputCode, this.matchCode)) {
            return false;
        }

        if (!this.exchangeCode) {
            return true;
        }

        const outputExchange = normalizeCode(outBlock?.EXCH_CLS_CODE);
        return !outputExchange || outputExchange === this.exchangeCode;
    }

    public getRoutingKeys(): readonly string[] {
        return createRoutingKeys(this.matchCode);
    }

    public getEventRoutingKeys(
        output: Record<string, unknown>,
    ): readonly string[] {
        const outBlock = output.OutBlock1 as
            | Record<string, unknown>
            | undefined;
        return createRoutingKeys(outBlock?.[this.outputCodeKey]);
    }
}

function resolveOutputCodeKey(apiName: string): string {
    if (apiName === 'U00' || apiName === 'U02') {
        return 'BSTP_CLS_CODE';
    }
    if (apiName.startsWith('Y') || apiName === 'V00' || apiName === 'C00') {
        return 'SYMB';
    }
    return 'SHRN_ISCD';
}

function normalizeCode(value: unknown): string {
    if (typeof value === 'number') {
        return String(value).trim().toUpperCase();
    }
    return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function createRoutingKeys(value: unknown): string[] {
    const code = normalizeCode(value);
    if (!code) return [];

    // 실시간 출력 코드가 시장/거래소 prefix를 포함하는 채널도 있어 suffix 후보를
    // 함께 색인한다. 후보는 이후 matches로 다시 검증한다.
    const keys = new Set([code]);
    for (let length = 2; length < code.length; length += 1) {
        keys.add(code.slice(-length));
    }
    return [...keys];
}

function codesMatch(outputCode: string, matchCode: string): boolean {
    if (!outputCode || !matchCode) {
        return false;
    }
    return (
        outputCode === matchCode ||
        outputCode.endsWith(matchCode) ||
        matchCode.endsWith(outputCode)
    );
}
