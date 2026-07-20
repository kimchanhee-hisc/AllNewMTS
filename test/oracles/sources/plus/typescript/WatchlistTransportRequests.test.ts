import { describe, expect, it } from 'vitest';

import { WATCHLIST_REALTIME_CHANNELS } from '@/api/services/WatchlistApiService';

import {
    WatchlistRealRequest,
    WatchlistSnapshotRequest,
} from './WatchlistTransportRequests';

describe('WatchlistRealRequest', () => {
    it('GD5001QK를 SFID 다건 입력/응답 구조로 직렬화한다', () => {
        const request = new WatchlistSnapshotRequest([
            {
                code: '005930',
                marketCode: 'NX',
                exchangeCode: '',
                isDelayed: false,
                registeredDate: '20260710',
            },
            {
                code: '000660',
                marketCode: 'J',
                exchangeCode: '',
                isDelayed: false,
                registeredDate: '20260709',
            },
        ]);
        const qry = request.getQryText();

        expect(qry).toContain('.SFID,GD5001QK,GD5001QK,RECLEN=4,SERVERNO=F;');
        expect(qry).toContain('InBlock1, InBlock1, input, occurs;');
        expect(qry).toContain('OutBlock1, OutBlock1, output, occurs;');
        expect(request.getTargetOutBlocks()).toEqual({
            InBlock1: 'OutBlock1',
        });
        expect(request.getInput().InBlock1).toMatchObject([
            { '9001': 'NX', '9002': '005930' },
            { '9001': 'J', '9002': '000660' },
        ]);
    });

    it('GD5001QK 한 전문의 입력을 최대 100건으로 제한한다', () => {
        const inputs = Array.from({ length: 101 }, (_, index) => ({
            code: String(index).padStart(6, '0'),
            marketCode: 'J',
            exchangeCode: '',
            isDelayed: false,
            registeredDate: '20260710',
        }));

        expect(() => new WatchlistSnapshotRequest(inputs)).toThrow(/1~100/);
    });

    it('채널·거래소·종목 기준 matcher key를 만들고 응답을 매칭한다', () => {
        const request = new WatchlistRealRequest({
            apiName: 'Y00',
            inputCode: 'AAPL0066',
            matchCode: 'AAPL',
            exchangeCode: '0066',
        });

        expect(request.getMatcherKey()).toBe('Y00:0066:AAPL');
        expect(
            request.matches({
                OutBlock1: { SYMB: 'AAPL', EXCH_CLS_CODE: '0066' },
            }),
        ).toBe(true);
        expect(
            request.matches({
                OutBlock1: { SYMB: 'AAPL', EXCH_CLS_CODE: '0214' },
            }),
        ).toBe(false);
    });

    it('occurs 실시간 채널은 종목코드를 배열 입력으로 직렬화한다', () => {
        const request = new WatchlistRealRequest({
            apiName: 'X50',
            inputCode: '005930',
            matchCode: '005930',
        });

        expect(request.getInput().InBlock1).toEqual([{ CODE: '005930' }]);
        expect(request.getInputSchema()).toMatchObject([
            { blockId: 'InBlock1', type: 'array' },
        ]);
    });

    it('S00처럼 occurs가 아닌 채널은 종목별 단건 입력을 유지한다', () => {
        const request = new WatchlistRealRequest({
            apiName: 'S00',
            inputCode: '005930',
            matchCode: '005930',
        });

        expect(request.getInput().InBlock1).toEqual({ CODE: '005930' });
        expect(request.getInputSchema()).toMatchObject([
            { blockId: 'InBlock1', type: 'single' },
        ]);
    });

    it('XMF-only 채널도 메모리 qry를 생성한다', () => {
        const request = new WatchlistRealRequest({
            apiName: 'C00',
            inputCode: 'UPBBTC',
            matchCode: 'BTC',
            exchangeCode: 'UPB',
        });

        expect(request.getQryText()).toContain('.Feed,C00,C00');
    });

    it.each(WATCHLIST_REALTIME_CHANNELS)(
        '%s 채널의 구독용 메모리 qry를 생성한다',
        apiName => {
            const request = new WatchlistRealRequest({
                apiName,
                inputCode: 'TEST',
                matchCode: 'TEST',
            });

            expect(request.getQryText()).toContain(`,${apiName},${apiName}`);
        },
    );
});
