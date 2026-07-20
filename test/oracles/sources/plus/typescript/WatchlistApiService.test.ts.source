import { afterEach, describe, expect, it, vi } from 'vitest';

import ApiClient, { type RealSubscriptionScope } from '@/api/client';

import {
    WATCHLIST_REALTIME_CHANNELS,
    default as WatchlistApiService,
    watchlistApiTesting,
    type WatchlistItemDto,
} from './WatchlistApiService';

function item(overrides: Partial<WatchlistItemDto> = {}): WatchlistItemDto {
    return {
        id: 'J::005930',
        code: '005930',
        name: '삼성전자',
        marketCode: 'J',
        effectiveMarketCode: 'UN',
        exchangeCode: '',
        registeredDate: '20260710',
        stockType: '',
        isNxtSupported: true,
        isNxtFallback: false,
        isDelayed: false,
        quote: {
            price: '80000',
            change: '1000',
            changeRate: '1.25',
            sign: '2',
            currency: 'KRW',
            status: 'snapshot',
        },
        ...overrides,
    };
}

describe('WatchlistApiService registry', () => {
    afterEach(() => {
        watchlistApiTesting.clearItemMetadataCache();
        vi.restoreAllMocks();
    });

    it('레거시 관심종목의 32개 실시간 채널을 등록한다', () => {
        expect(WATCHLIST_REALTIME_CHANNELS).toHaveLength(32);
        expect(WATCHLIST_REALTIME_CHANNELS).toContain('C00');
        expect(WATCHLIST_REALTIME_CHANNELS).toContain('O40');
    });

    it('ATS와 자산군에 맞는 현재가 채널을 선택한다', () => {
        expect(
            watchlistApiTesting.resolveRealtimeTargets(item()),
        ).toMatchObject([{ apiName: 'X50', inputCode: '005930' }]);
        expect(
            watchlistApiTesting.resolveRealtimeTargets(
                item({ effectiveMarketCode: 'NX' }),
            ),
        ).toMatchObject([{ apiName: 'X00' }]);
        expect(
            watchlistApiTesting.resolveRealtimeTargets(
                item({ marketCode: 'QF', effectiveMarketCode: 'QF' }),
            ),
        ).toMatchObject([{ apiName: 'F80' }]);
        expect(
            watchlistApiTesting.resolveRealtimeTargets(
                item({
                    code: 'BTC',
                    marketCode: 'CR',
                    effectiveMarketCode: 'CR',
                    exchangeCode: 'UPB',
                }),
            ),
        ).toMatchObject([{ apiName: 'C00', inputCode: 'UPBBTC' }]);
    });

    it('공통 session이 전달한 scope로 실시간을 구독하고 해제한다', async () => {
        const cancelAll = vi.fn(async () => undefined);
        const scope: RealSubscriptionScope = {
            id: 'watchlist-route-scope',
            name: 'watchlist',
            cancelPolicy: 'auto',
            cancelAll,
            setRoutePath: vi.fn(),
        };
        const createScope = vi.spyOn(ApiClient, 'createRealSubscriptionScope');
        const subscribeRealBatch = vi
            .spyOn(ApiClient, 'subscribeRealBatch')
            .mockResolvedValue([]);

        const session = await WatchlistApiService.subscribeQuotes(
            [item()],
            {
                onQuote: vi.fn(),
                onError: vi.fn(),
            },
            { scope },
        );

        expect(createScope).not.toHaveBeenCalled();
        expect(subscribeRealBatch).toHaveBeenCalledWith(expect.any(Array), {
            scope,
        });
        await session.cancel();
        expect(cancelAll).toHaveBeenCalledTimes(1);
    });

    it('NXT 미지원 국내 종목은 KRX 조회로 폴백한다', () => {
        expect(
            watchlistApiTesting.resolveSnapshotMarketCode('J', '', false, 'NX'),
        ).toBe('J');
        expect(
            watchlistApiTesting.resolveSnapshotMarketCode('J', '', true, 'NX'),
        ).toBe('NX');
    });

    it('자산과 거래소에 맞는 getItemCodeInfo 시장 링크를 선택한다', () => {
        expect(watchlistApiTesting.resolveMarketLinkCodes('J', '')).toBe(
            '1,2,3,4,5,6,7',
        );
        expect(watchlistApiTesting.resolveMarketLinkCodes('OY', '0066')).toBe(
            '10',
        );
        expect(watchlistApiTesting.resolveMarketLinkCodes('OY', '0214')).toBe(
            '12',
        );
        expect(watchlistApiTesting.resolveMarketLinkCodes('OV', '')).toBe(
            '20,21,22',
        );
        expect(watchlistApiTesting.resolveMarketLinkCodes('CR', '')).toBe('50');
    });

    it('동일 시장·거래소·종목의 중복 행을 등록순으로 한 번만 유지한다', () => {
        const rows = watchlistApiTesting.deduplicateInstrumentRows([
            { marketCode: 'J', exchangeCode: '', code: '005930', order: 1 },
            { marketCode: 'J', exchangeCode: '', code: '005930', order: 2 },
            {
                marketCode: 'OY',
                exchangeCode: '0066',
                code: 'AAPL',
                order: 3,
            },
        ]);

        expect(rows.map(row => row.order)).toEqual([1, 3]);
    });

    it('서버 그룹 순서와 종목 등록순을 보존하고 최대 100개만 조회한다', async () => {
        const rawItems = Array.from({ length: 102 }, (_, index) => ({
            mrkt_div_cls_code: index === 0 ? '' : 'J',
            shrn_iscd: index === 0 ? '' : String(index).padStart(6, '0'),
            exch_cls_code: '',
            ldate: '20260710',
            color: '',
            folder_yn: index === 0 ? 'Y' : 'N',
        }));
        const apiCall = vi
            .spyOn(ApiClient, 'call')
            .mockImplementation(async request => {
                if (request.getApiName() === 'CCS20001') {
                    return {
                        apiName: 'CCS20001',
                        success: true,
                        outputType: 'Single',
                        outputTypeName: 'Single',
                        output: {
                            OutBlock2: [
                                {
                                    grpnum: '002',
                                    grpname: '두 번째',
                                    tot_jongcnt: '2',
                                },
                                {
                                    grpnum: '001',
                                    grpname: '첫 번째',
                                    tot_jongcnt: '1',
                                },
                            ],
                        },
                    };
                }
                if (request.getApiName() === 'CCS20000') {
                    return {
                        apiName: 'CCS20000',
                        success: true,
                        outputType: 'Single',
                        outputTypeName: 'Single',
                        output: { OutBlock2: rawItems },
                    };
                }
                return {
                    apiName: 'GD5001QK',
                    success: true,
                    outputType: 'Single',
                    outputTypeName: 'Single',
                    output: {
                        OutBlock1: Array.from({ length: 100 }, (_, index) => ({
                            '3': `종목 ${index + 1}`,
                            '4': '1000',
                            '5': '10',
                            '6': '2',
                            '7': '1.0',
                            '1171': 'KRW',
                        })),
                    },
                };
            });

        const groups = await WatchlistApiService.fetchGroups('user');
        const items = await WatchlistApiService.fetchGroupItems(
            'user',
            '002',
            'UN',
        );

        expect(groups.map(group => group.id)).toEqual(['002', '001']);
        expect(items).toHaveLength(100);
        expect(items[0]).toMatchObject({
            code: '000001',
            name: '종목 1',
        });
        expect(items[99]?.code).toBe('000100');
        expect(
            apiCall.mock.calls.filter(
                ([request]) => request.getApiName() === 'GD5001QK',
            ),
        ).toHaveLength(1);
        const snapshotRequest = apiCall.mock.calls.find(
            ([request]) => request.getApiName() === 'GD5001QK',
        )?.[0];
        expect(snapshotRequest?.getInput().InBlock1).toHaveLength(100);
    });
});
