--===========================================================================
-- 화  면  명 : 공통함수
-- 화  면  ID : 
-- 개      요 : 
-- 작      성 : 
-- 수      정 : 
--===========================================================================
--============================================================================
-- gf_Split(szData, pat) : Split
--============================================================================
function gf_Split(szData, pat)
	szData = pat..szData..pat
	
	local t = {} 
	local fpat = "(.-)" .. pat
	local last_end = 1
	local s, e, cap = szData:find(fpat, 1)
	
	while s do
	if s ~= 1 or cap ~= "" then
		 table.insert(t,cap)
	end
	last_end = e+1
	s, e, cap = szData:find(fpat, last_end)
	end
	
	if last_end <= #szData then
	cap = szData:sub(last_end)
	table.insert(t, cap)
	end
	
	return t
end

--============================================================================
-- gf_SetMetaData(szFgColor, szSize, szFont 0자동 / 1문자폰트 / 2숫자폰트, szStyle 00레귤러 / 01볼드 / 02미디움, szBgColor, szLine 0없음 / 1있음) : SetMetaCaption
--============================================================================
function gf_SetMetaData(szFgColor, szSize, szFont, szStyle, szBgColor, szLine)
	local szReturnData = ""

	if (nil == szFgColor or "" == szFgColor) or (nil == szSize or "" == szSize) or (nil == szFont or "" == szFont) or (nil == szStyle or "" == szStyle) or (nil == szBgColor or "" == szBgColor) or (nil == szLine or "" == szLine) then
		return szReturnData
	
	else
		szReturnData = "<color="..szFgColor.."`size="..szSize.."`font="..szFont.."`style="..szStyle.."`bgcolor="..szBgColor.."`line="..szLine..">"
		return szReturnData
	end
end

--============================================================================
-- gf_Tonumber(szData) : TONUMBER
--============================================================================
function gf_Tonumber(szData)
	return tonumber(szData) or 0
end

--============================================================================
-- gf_Tostring(szData) : TOSTRING
--============================================================================
function gf_Tostring(szData)
	if (szData == nil) or (szData == "nil") or (szData == "") then
		return ""
	else
		return tostring(szData)
	end
end

--============================================================================
-- gf_Trim : trim 재정의
--============================================================================
function gf_Trim(szStr)
	if szStr == nil then
		return ""
	else
		return Trim(szStr)
	end
end

--============================================================================
-- 테이블 비교
--============================================================================
function gf_TablesAreDeepEqual(tTbl1, tTbl2)
    -- 두 테이블의 메모리 주소를 비교
    if tTbl1 == tTbl2 then
        return true
    end

    -- 테이블이 nil이거나 타입이 다르면 false
    if type(tTbl1) ~= "table" or type(tTbl2) ~= "table" then
        return false
    end

    -- 첫 번째 테이블의 모든 키와 값 비교
    for key, value in pairs(tTbl1) do
        if tTbl2[key] == nil then
            return false -- tTbl2에 key가 없으면 false
        end

        -- 값이 또 다른 테이블인 경우 재귀 호출
        if type(value) == "table" then
            if not gf_TablesAreDeepEqual(value, tTbl2[key]) then
                return false
            end
        else
            if value ~= tTbl2[key] then
                return false
            end
        end
    end

    -- 두 번째 테이블의 모든 키와 값 비교
    for key, value in pairs(tTbl2) do
        if tTbl1[key] == nil then
            return false -- tTbl1에 key가 없으면 false
        end
    end

    return true
end


--============================================================================
-- gf_CommaValue(szAmount, nDot)
--============================================================================
function gf_CommaValue(szAmount, nDot)
	local szFormat = ""
	
	-- 소수점 표시 
	if ( nDot == 0 ) then
		szFormat = gf_Tonumber(szAmount)
	else 
		szFormat = string.format("%."..gf_Tostring(nDot).."f", szAmount)
	end
	
	-- 천 단위 표시 
	while true do  
		szFormat, k = string.gsub(szFormat, "^(-?%d+)(%d%d%d)", '%1,%2')
		if ( k==0 ) then
			break
		end
	end

	return szFormat
end

--============================================================================
-- gf_GetValueHan(szData) : 숫자한글변화 
--============================================================================
function gf_GetValueHan(szData)
	local szTemp, nDiv, nMod, bFlag
	local szHanValue = ""
	local tM1 = {"", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"}
	local tM2 = {"", "십", "백", "천"}
	local tM3 = {"", "만", "억", "조"}
	
	szTemp = szData
	
	if szTemp == "" then
		return ""
	end
	
	if string.find( szTemp, "%." ) then 
		local szDot = string.find(szTemp, "%.")
		szTemp = string.sub(szTemp, 1, gf_Tonumber(szDot) - 1)
	end
	
	if string.len(szTemp) > 16 then
		szTemp = string.sub(szTemp, 1, 16)
	end
	
	bFlag = false

	for i = 1, string.len(szTemp) do
		nDiv = (string.len(szTemp) - i) / 4
		nMod = (string.len(szTemp) - i) % 4
		
		if string.sub(szTemp, i, i) ~= "0" then
			bFlag = true
			szHanValue = szHanValue .. tM1[string.sub(szTemp, i, i)+1] .. tM2[nMod+1]
		end
		
		if nMod == 0 and bFlag == true then
			bFlag = false
			szHanValue = szHanValue ..  tM3[nDiv+1]
		end
	end
	
	return szHanValue
end

--============================================================================
-- gf_SetDate(nYear, nMonth, nDay) : 일자 계산 
--============================================================================
function gf_SetDate(nYear, nMonth, nDay)
	if (gf_Tonumber(nYear) == 0) then
		nYear = 0
	elseif (gf_Tonumber(nMonth) == 0) then
		nMonth = 0
	elseif (gf_Tonumber(nDay) == 0) then
		nDay = 0
	end
	
	-- 오늘 날짜 받기
	local szDate = Form.GetSharedData("&HOST_DATE", false)
	local t = os.date("*t")
	
	t.year  = gf_Tonumber(string.sub(szDate, 1, 4))
	t.month = gf_Tonumber(string.sub(szDate, 5, 6))
	t.day   = gf_Tonumber(string.sub(szDate, 7, 8))
	
	-- 날짜 셋팅
	t.year  = t.year  + nYear
	t.month = t.month + nMonth
	t.day   = t.day   + nDay
	
	t = os.date("*t", os.time(t))
	
	return string.format("%04d%02d%02d", t.year, t.month, t.day)
end

--============================================================================
-- gf_SetDate2(szdate, nYear, nMonth, nDay) : 특정 일자 기준 일자 계산 
--============================================================================
function gf_SetDate2(szDate, nYear, nMonth, nDay)
	if (gf_Tonumber(nYear) == 0) then
		nYear = 0
	elseif (gf_Tonumber(nMonth) == 0) then
		nMonth = 0
	elseif (gf_Tonumber(nDay) == 0) then
		nDay = 0
	end
	
	local t = os.date("*t")
	
	t.year  = gf_Tonumber(string.sub(szDate, 1, 4))
	t.month = gf_Tonumber(string.sub(szDate, 5, 6))
	t.day   = gf_Tonumber(string.sub(szDate, 7, 8))
	
	-- 날짜 셋팅
	t.year  = t.year  + nYear
	t.month = t.month + nMonth
	t.day   = t.day   + nDay
	
	t = os.date("*t", os.time(t))
	
	return string.format("%04d%02d%02d", t.year, t.month, t.day)
end

--============================================================================
-- gf_FebLastDay(szDate) : 2월 윤달 계산 
--============================================================================
function gf_FebLastDay(szDate)
	local nYear = gf_Tonumber(string.sub(szDate, 1, 4))
	
	if (((nYear % 4) == 0) and ((nYear % 100) ~= 0) or ((nYear % 400) == 0)) then
		-- 윤년구하는 공식 -4년마다 한번씩, //100년마다는 해당안됨 // 400년마다 해당된 날
		return "29"
	else
		return "28"
	end
end

--============================================================================
-- gf_GetTickValue(szItemCode,szPrice,nFlag) : 틱계산
--============================================================================
function gf_GetTickValue(szItemCode,szPrice,nFlag)
	local szMarketGb = gf_Trim(Form.GetItemCodeInfo( szItemCode, "markettext", "1,2,3,4,5,6,7")) -- ETN H / 신주인수권 T / ELW W / 코넥스 P / KOTC U / 코스피 J / 코스닥 Q
	local szMarketTp = gf_Trim(Form.GetItemCodeInfo( szItemCode, "stocktype", "1,2,3,4,5,6,7")) -- ETF EF
	local szTick
	local nPrice 
	nPrice = CInt(szPrice)

	if szMarketGb == "J" and szMarketTp == "EF" then -- ETF
		if nFlag == 1 then -- +
			if nPrice >= 2000 then
				szTick = "5"
			else
				szTick = "1"
			end
		else
			if nPrice > 2000 then
				szTick = "5"
			else
				szTick = "1"
			end
		end

	elseif szMarketGb == "J"  or  szMarketGb == "T" or szMarketGb == "SJ" then	-- 코스피/수익증권/KOTC
		if nFlag == 1 then -- +
			if nPrice >= 500000 then
				szTick = "1000"
			elseif nPrice >= 200000 then
				szTick = "500"
			elseif nPrice >= 50000 then
				szTick = "100"
			elseif nPrice >= 20000 then
				szTick = "50"
			elseif nPrice >= 5000 then
				szTick = "10"
			elseif nPrice >= 2000 then
				szTick = "5"
			else
				szTick = "1"
			end
		else		-- -
			if nPrice > 500000 then
				szTick = "1000"
			elseif nPrice > 200000 then
				szTick = "500"
			elseif nPrice > 50000 then
				szTick = "100"
			elseif nPrice > 20000 then
				szTick = "50"
			elseif nPrice > 5000 then
				szTick = "10"
			elseif nPrice > 2000 then
				szTick = "5"
			else
				szTick = "1"
			end			
		end
	
	elseif szMarketGb == "Q" or szMarketGb == "P" then -- 코스닥/코넥스	
	    if nFlag == 1 then -- +
			if nPrice >= 500000 then
				szTick = "1000"
			elseif nPrice >= 200000 then
				szTick = "500"	
			elseif nPrice >= 50000 then
				szTick = "100"
			elseif nPrice >= 20000 then
				szTick = "50"
			elseif nPrice >= 5000 then
				szTick = "10"
			elseif nPrice >= 2000 then
				szTick = "5"
			else
				szTick = "1"
			end
		else
			if nPrice > 500000 then
				szTick = "1000"
			elseif nPrice > 200000 then
				szTick = "500"
			elseif nPrice > 50000 then
				szTick = "100"
			elseif nPrice > 20000 then
				szTick = "50"
			elseif nPrice > 5000 then
				szTick = "10"
			elseif nPrice > 2000 then
				szTick = "5"
			else
				szTick = "1"
			end			
	    end
	
	elseif szMarketGb == "W" then 		--elw
		szTick = "5"
		
	elseif szMarketGb == "GOLD" then	-- 금현물
		szTick = "10"
	else
		szTick = "5"
	end
		
	return szTick
end

--============================================================================
-- 해외주식 틱계산
--============================================================================
function gf_GetOvSeaTickValue(szItemCode, szUnit, szPrice, szTickType, nFlag)
    nPrice = gf_Tonumber(szPrice)

    if szUnit == "USD" then -- 미국 달러
        if nFlag == 0 then
            if nPrice <= 1 then -- 1달러 미만
                szTick = "0.0001"
            else
                szTick = "0.01"
            end
        
        else
            if nPrice < 1 then -- 1달러 미만
                szTick = "0.0001"
            else
                szTick = "0.01"
            end
        end
        
    elseif szUnit == "CNY" then -- 중국
        local szMarketTp = gf_Trim(Form.GetItemCodeInfo( szItemCode, "stocktype", "10,11,12")) -- ETF EF
        
        if szMarketTp == "EF" then
            if nFlag == 0 then
                szTick = "0.001"
            
            else
                szTick = "0.001"
            end
            
        else
            if nFlag == 0 then
                szTick = "0.01"
            
            else
                szTick = "0.01"
            end
        end
        
    elseif szUnit == "HKD" then -- 홍콩
        if szTickType == "5" then
            if nFlag == 0 then
                if nPrice >= 0 and nPrice <= 0.01 then
                    szTick = "0.001"
                
                elseif nPrice > 0.01 and nPrice <= 1 then
                    szTick = "0.001"
                
                elseif nPrice > 1 and nPrice <= 5 then
                    szTick = "0.002"
                
                elseif nPrice > 5 and nPrice <= 10 then
                    szTick = "0.005"
                
                elseif nPrice > 10 and nPrice <= 20 then
                    szTick = "0.01"
                
                elseif nPrice > 20 and nPrice <= 100 then
                    szTick = "0.02"
                
                elseif nPrice > 100 and nPrice <= 200 then
                    szTick = "0.05"
                
                elseif nPrice > 200 and nPrice <= 500 then
                    szTick = "0.1"
                
                elseif nPrice > 500 and nPrice <= 1000 then
                    szTick = "0.2"
                
                elseif nPrice > 1000 and nPrice <= 2000 then
                    szTick = "0.5"
                
                elseif nPrice > 2000 and nPrice <= 10000 then
                    szTick = "1"
                    
                end
                
            else
                if nPrice >= 0 and nPrice < 0.01 then
                    szTick = "0.001"
                
                elseif nPrice >= 0.01 and nPrice < 1 then
                    szTick = "0.001"
                
                elseif nPrice >= 1 and nPrice < 5 then
                    szTick = "0.002"
                
                elseif nPrice >= 5 and nPrice < 10 then
                    szTick = "0.005"
                
                elseif nPrice >= 10 and nPrice < 20 then
                    szTick = "0.01"
                
                elseif nPrice >= 20 and nPrice < 100 then
                    szTick = "0.02"
                
                elseif nPrice >= 100 and nPrice < 200 then
                    szTick = "0.05"
                
                elseif nPrice >= 200 and nPrice < 500 then
                    szTick = "0.1"
                
                elseif nPrice >= 500 and nPrice < 1000 then
                    szTick = "0.2"
                
                elseif nPrice >= 1000 and nPrice < 2000 then
                    szTick = "0.5"
                
                elseif nPrice >= 2000 and nPrice < 10000 then
                    szTick = "1"
                    
                end
            end
        
        elseif szTickType == "3" then
            if nFlag == 0 then
                szTick = "0.05"
            
            else
                szTick = "0.05"
        
            end
        elseif szTickType == "1" then
            if nFlag == 0 then
                if nPrice > 0 and nPrice <= 0.25 then
                    szTick = "0.001"
                
                elseif nPrice > 0.25 and nPrice <= 0.5 then
                    szTick = "0.005"
                    
                elseif nPrice > 0.5 and nPrice <= 10 then
                    szTick = "0.01"
                
                elseif nPrice > 10 and nPrice <= 20 then
                    szTick = "0.01"

                elseif nPrice > 20 and nPrice <= 50 then
                    szTick = "0.02"

                elseif nPrice > 50 and nPrice <= 100 then
                    szTick = "0.05"
                
                elseif nPrice > 100 and nPrice <= 200 then
                    szTick = "0.1"
                
                elseif nPrice > 200 and nPrice <= 500 then
                    szTick = "0.2"
                    
                elseif nPrice > 500 and nPrice <= 1000 then
                    szTick = "0.5"
                    
                elseif nPrice > 1000 and nPrice <= 2000 then
                    szTick = "1"
                
                elseif nPrice > 2000 and nPrice <= 5000 then
                    szTick = "2"
                
                else
                    szTick = "5"
                    
                end
            
            else
                if nPrice >= 0 and nPrice < 0.25 then
                    szTick = "0.001"
                
                elseif nPrice >= 0.25 and nPrice < 0.5 then
                    szTick = "0.005"
                    
                elseif nPrice >= 0.5 and nPrice < 10 then
                    szTick = "0.01"
                
                elseif nPrice >= 10 and nPrice < 20 then
                    szTick = "0.01"
                
                elseif nPrice >= 20 and nPrice < 50 then
                    szTick = "0.02"

                elseif nPrice >= 50 and nPrice < 100 then
                    szTick = "0.05"
                
                elseif nPrice >= 100 and nPrice < 200 then
                    szTick = "0.1"
                
                elseif nPrice >= 200 and nPrice < 500 then
                    szTick = "0.2"
                    
                elseif nPrice >= 500 and nPrice < 1000 then
                    szTick = "0.5"
                    
                elseif nPrice >= 1000 and nPrice < 2000 then
                    szTick = "1"
                
                elseif nPrice >= 2000 and nPrice < 5000 then
                    szTick = "2"
                
                else
                    szTick = "5"
                    
                end
            end
        elseif szTickType == "6" then
            if nFlag == 0 then
                if nPrice > 0 and nPrice <= 0.25 then
                    szTick = "0.001"
                
                elseif nPrice > 0.25 and nPrice <= 0.5 then
                    szTick = "0.005"
                    
                elseif nPrice > 0.5 and nPrice <= 10 then
                    szTick = "0.01"
                
                elseif nPrice > 10 and nPrice <= 20 then
                    szTick = "0.02"

                elseif nPrice > 20 and nPrice <= 50 then
                    szTick = "0.05"

                elseif nPrice > 50 and nPrice <= 100 then
                    szTick = "0.05"
                
                elseif nPrice > 100 and nPrice <= 200 then
                    szTick = "0.1"
                
                elseif nPrice > 200 and nPrice <= 500 then
                    szTick = "0.2"
                    
                elseif nPrice > 500 and nPrice <= 1000 then
                    szTick = "0.5"
                    
                elseif nPrice > 1000 and nPrice <= 2000 then
                    szTick = "1"
                
                elseif nPrice > 2000 and nPrice <= 5000 then
                    szTick = "2"
                
                else
                    szTick = "5"
                    
                end
            
            else
                if nPrice >= 0 and nPrice < 0.25 then
                    szTick = "0.001"
                
                elseif nPrice >= 0.25 and nPrice < 0.5 then
                    szTick = "0.005"
                    
                elseif nPrice >= 0.5 and nPrice < 10 then
                    szTick = "0.01"
                
                elseif nPrice >= 10 and nPrice < 20 then
                    szTick = "0.02"
                
                elseif nPrice >= 20 and nPrice < 50 then
                    szTick = "0.05"

                elseif nPrice >= 50 and nPrice < 100 then
                    szTick = "0.05"
                
                elseif nPrice >= 100 and nPrice < 200 then
                    szTick = "0.1"
                
                elseif nPrice >= 200 and nPrice < 500 then
                    szTick = "0.2"
                    
                elseif nPrice >= 500 and nPrice < 1000 then
                    szTick = "0.5"
                    
                elseif nPrice >= 1000 and nPrice < 2000 then
                    szTick = "1"
                
                elseif nPrice >= 2000 and nPrice < 5000 then
                    szTick = "2"
                
                else
                    szTick = "5"
                    
                end
            end
        else
            szTick = "0.05"
        end
        
    else
        szTick = "0.001"
    end

    return szTick
    
end

--============================================================================
-- gf_GetFOTickValue(szItemCode, nPrice, nFlag) : 선물옵션 틱계산
--============================================================================
function gf_GetFOTickValue(szItemCode, nPrice, nFlag)
    local szMarketType = Form.GetItemCodeInfo(szItemCode, "markettext")

	local nTick = 0.01

	if szMarketType == "F" then -- 선물
        nTick = 0.05
	elseif szMarketType == "QF" then -- 코스닥150선물
        nTick = 0.10
	elseif szMarketType == "EF" then -- KRX300
        nTick = 0.20
	elseif szMarketType == "QO" then --코스닥150옵션
		if nFlag == 1 then	--+
			if nPrice >= 50 then
				nTick = 0.50
			else
				nTick = 0.10
			end
		else
			if nPrice > 50 then
				nTick = 0.50
			else
				nTick = 0.10
			end		
		end		
	elseif szMarketType == "KF" then -- 미니선물
		nTick = 0.02
	elseif szMarketType == "O" or szMarketType == "WO" then -- 옵션, 위클리옵션
		if nFlag == 1 then -- +
			if nPrice >= 10 then
				nTick = 0.05
			else
				nTick = 0.01
			end	
		else				--	-
			if nPrice > 10 then
				nTick = 0.05
			else
				nTick = 0.01
			end
		end
	elseif szMarketType == "KO" then -- 미니옵션
		if nFlag == 1 then -- +
			if nPrice >= 10 then
				nTick = 0.05
			elseif nPrice >= 3 then	
				nTick = 0.02
			else
				nTick = 0.01
			end	
		else				--	-
			if nPrice > 10 then
				nTick = 0.05
			elseif nPrice > 3 then	
				nTick = 0.02
			else
				nTick = 0.01
			end	
		end
	elseif szMarketType == "VF" then -- 변동성지수선물
		nTick = 0.05
	elseif szMarketType == "XF" then -- 섹터지수선물
		nTick = 0.20
	elseif szMarketType == "JF" then -- 주식선물
		if nFlag == 1 then -- +
			if nPrice >= 500000 then
				nTick = 1000
			elseif nPrice >= 100000 then
				nTick = 500
			elseif nPrice >= 50000 then
				nTick = 100
			elseif nPrice >= 10000 then
				nTick = 50
			elseif nPrice >= 5000 then
				nTick = 10
			elseif nPrice >= 1000 then
				nTick = 5
			else
				nTick = 1
			end
		else
			if nPrice > 500000 then
				nTick = 1000
			elseif nPrice > 100000 then
				nTick = 500
			elseif nPrice > 50000 then
				nTick = 100
			elseif nPrice > 10000 then
				nTick = 50
			elseif nPrice > 5000 then
				nTick = 10
			elseif nPrice > 1000 then
				nTick = 5
			else
				nTick = 1
			end
		end
	elseif szMarketType == "CF" then -- 상품선물
		local szTempCode0 = string.sub(szItemCode, 2, 2)
		local szTempCode1 = string.sub(szItemCode, 3, 3)
		
		-- 금리파생
		if szTempCode0 == "6" then
			nTick = 0.01
		-- 통화파생
		elseif szTempCode0 == "7" then
			-- 위안
			if szTempCode1 == "8" then
				nTick = 0.01
			-- 달러, 엔, 유로
			else
				nTick = 0.10
			end
		-- 상품파생
		elseif szTempCode0 == "8" then
			-- 금
			if szTempCode1 == "8" then
				nTick = 10
			-- 돈육
			else
				nTick = 5
			end
		end
	end
	
	return nTick
end

--============================================================================
-- BASE64 Encoding
--============================================================================
function gf_GetEncodeBASE64(szData)
    local b='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/' -- You will need this for encoding/decoding
    
    return ((szData:gsub('.', function(x)
        local r,b='',x:byte()
        for i=8,1,-1 do r=r..(b%2^i-b%2^(i-1)>0 and '1' or '0') end
        return r;
    end)..'0000'):gsub('%d%d%d?%d?%d?%d?', function(x)
        if (#x < 6) then return '' end
        local c=0
        for i=1,6 do c=c+(x:sub(i,i)=='1' and 2^(6-i) or 0) end
        return b:sub(c+1,c+1)
    end)..({ '', '==', '=' })[#szData%3+1])
end

--============================================================================
-- BASE64 Decoding
--============================================================================
function gf_GetDecodeBASE64(data)
    local b='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/' -- You will need this for encoding/decoding

    data = string.gsub(data, '[^'..b..'=]', '')
    return (data:gsub('.', function(x)
        if (x == '=') then return '' end
        local r,f='',(b:find(x)-1)
        for i=6,1,-1 do r=r..(f%2^i-f%2^(i-1)>0 and '1' or '0') end
        return r;
    end):gsub('%d%d%d?%d?%d?%d?%d?%d?', function(x)
        if (#x ~= 8) then return '' end
        local c=0
        for i=1,8 do c=c+(x:sub(i,i)=='1' and 2^(8-i) or 0) end
        return string.char(c)
    end))
end

--============================================================================
-- 한글 길이 구하는 함수
--============================================================================
function gf_Utf8len(str)
    local currentIndex = 1
    local strLen = 0
    while currentIndex <= #str do
        local char = string.byte(str, currentIndex)
        if gf_Chsize(char) == 0 then
            break
        end
        currentIndex = currentIndex + gf_Chsize(char)
        strLen = strLen + 1
    end
    
    return strLen
end

--============================================================================
function gf_Chsize(char)
    if not char then
        return 0
    elseif char > 240 then
        return 4
    elseif char > 225 then
        return 3
    elseif char > 192 then
        return 2
    else
        return 1
    end
end

--============================================================================
-- 한글 자르는 함수    start_char : 문자 시작위치 (1베이스), num_chars 가져올 문자 갯수
--============================================================================
-- UTF-8 문자열 자르기 함수
function gf_Utf8sub(str, start_char, num_chars)
    -- UTF-8 문자열의 길이를 계산하는 함수
    local function utf8_len(s)
        local _, count = s:gsub('[^\128-\191]', '') -- UTF-8 연속 바이트가 아닌 바이트 수를 셉니다
        return count
    end

    -- 주어진 문자 인덱스에 해당하는 바이트 위치를 계산하는 함수
    local function utf8_offset(s, char_index)
        local pos = 1
        local bytes = #s
        local char_count = 0

        while pos <= bytes do
            char_count = char_count + 1
            if char_count == char_index then
                return pos
            end
            local byte = s:byte(pos)
            if byte <= 127 then
                pos = pos + 1
            elseif byte <= 223 then
                pos = pos + 2
            elseif byte <= 239 then
                pos = pos + 3
            else
                pos = pos + 4
            end
        end

        return bytes + 1
    end

    local len = utf8_len(str)
    if start_char < 0 then
        start_char = len + start_char + 1
    end
    if num_chars < 0 then
        num_chars = len - start_char + 1 + num_chars
    end

    local start_byte = utf8_offset(str, start_char)
    local end_byte = utf8_offset(str, start_char + num_chars) - 1

    return str:sub(start_byte, end_byte)
end

--============================================================================
-- 한글 문자열의 길이를 체크하는 함수
--============================================================================
function gf_Utf8len(str)
    local _, count = string.gsub(str, "[^\128-\191]", "")
    return count
end

--============================================================================
-- NULL 공백 체크
-- print(gf_IsEmpty(nil)) -- true
-- print(gf_IsEmpty({})) -- true
-- print(gf_IsEmpty("")) -- true
-- print(gf_IsEmpty(" ")) -- false
--============================================================================
function gf_IsEmpty(value)
    -- nil 체크
    if value == nil then
        return true
    end

    local valueType = type(value)

    -- 테이블 체크
    if valueType == "table" then
        return next(value) == nil
    end

    -- 문자열 체크
    if valueType == "string" then
        return value == "nil" or value == ""
    end

    return false
end

--============================================================================
-- 문자열 마스킹 처리       szString : 문자열, szMaskFormat : 마스크포맷(예 ####.##.##)
--============================================================================
function gf_ApplyMask(input, mask)
    -- 숫자만 추출
    local digits = input:gsub("%D", "")
    local maskedOutput = ""
    local digitIndex = 1

    -- 마스크 형식에 맞춰 처리
    for i = 1, #mask do
        local maskChar = mask:sub(i, i)
        if maskChar == "#" then
            maskedOutput = maskedOutput .. digits:sub(digitIndex, digitIndex)
            digitIndex = digitIndex + 1
        else
            maskedOutput = maskedOutput .. maskChar
        end

        if digitIndex > #digits then
            break
        end
    end

    return maskedOutput
end

--============================================================================
-- 만료 여부 가져오기 (szDate: YYYYMMDD)
--============================================================================
function gf_IsExpired(szDate)
    if szDate == nil or szDate == "" then
        return false
    end

    -- 날짜 문자열을 DateTime 객체로 변환
    local szYear, szMonth, szDay = szDate:match("(%d%d%d%d)(%d%d)(%d%d)")
    local expireDate = os.time{year = szYear, month = szMonth, day = szDay}

    -- 현재 날짜 가져오기
    local szToday = Form.GetSharedData("&HOST_DATE", false)
    local szTodayYear, szTodayMonth, szTodayDay = szToday:match("(%d%d%d%d)(%d%d)(%d%d)")
    local todayDate = os.time{year = szTodayYear, month = szTodayMonth, day = szTodayDay}

    -- 만료 여부 확인
    return expireDate < todayDate
end

--============================================================================
-- 테이블을 특정 키로 그룹핑
--============================================================================
function gf_GroupBy(tTbl, szKey)
    local result = {}

    for i, item in ipairs(tTbl) do
        local group = item[szKey]
        if not result[group] then
            result[group] = {}
        end

        table.insert(result[group], item)
    end

    return result
end

--============================================================================
-- 테이블 딥카피
--============================================================================
function gf_DeepCopy(original)
    local copy
    if type(original) == "table" then
        copy = {}
        for key, value in pairs(original) do
            copy[gf_DeepCopy(key)] = gf_DeepCopy(value)
        end
        setmetatable(copy, gf_DeepCopy(getmetatable(original)))
    else
        copy = original
    end
    return copy
end


--============================================================================
-- 날짜 문자열을 지정된 형식으로 포맷팅하는 함수
-- @param paramDateString 입력 날짜 문자열 (yyyyMMdd 또는 yyyyMMddHHmmss 형식)
-- @param format 출력 형식 (기본값: "yyyy.MM.dd")
-- @return 포맷팅된 날짜 문자열
--      testCases = {
--          {"20231017", "yyyy-MM-dd"},
--          {"20231017123456", "yyyy-MM-dd HH:mm:ss"},
--          {"20231017", "yyyy년 MM월 dd일"},
--          {"20231017123456", "yyyy년 MM월 dd일 HH시 mm분 ss초"},
--          {"20231017", "MM/dd/yyyy"},
--          {"20231017123456", "HH:mm:ss, MM/dd/yyyy"},
--      }
--============================================================================
function gf_FormatDate(paramDateString, format)
    format = format or "yyyy.MM.dd"

    local dateString = paramDateString
    local year, month, day, hour, min, sec

    if #dateString == 8 then  -- yyyyMMdd 형식일 때
        year, month, day = dateString:match("(%d%d%d%d)(%d%d)(%d%d)")
    elseif #dateString == 14 then  -- yyyyMMddHHmmss 형식일 때
        year, month, day, hour, min, sec = dateString:match("(%d%d%d%d)(%d%d)(%d%d)(%d%d)(%d%d)(%d%d)")
    else
        return paramDateString  -- 형식이 맞지 않을 경우 원래 문자열 반환
    end

    local result = format
    result = result:gsub("yyyy", year)
    result = result:gsub("MM", month)
    result = result:gsub("dd", day)

    if hour and min and sec then
        result = result:gsub("HH", hour)
        result = result:gsub("mm", min)
        result = result:gsub("ss", sec)
    else
        -- 시간 정보가 없는 경우, 해당 포맷 문자열을 제거
        result = result:gsub("HH", "")
        result = result:gsub("mm", "")
        result = result:gsub("ss", "")
    end

    -- 불필요한 구분자 정리
    result = result:gsub("%.%.+", ".")  -- 연속된 점을 하나로
    result = result:gsub("::", ":")     -- 연속된 콜론을 하나로
    result = result:gsub("%.%s*$", "")  -- 끝에 있는 점 제거
    result = result:gsub(":%s*$", "")   -- 끝에 있는 콜론 제거
    result = result:gsub("%s+", " ")    -- 중복된 공백 제거

    return result
end

--============================================================================
-- 배열 테이블에 특정 값이 있는지 체크하는 함수
--============================================================================
function gf_Contains(tTbl, value)
    for i, v in ipairs(tTbl) do
        if v == value then
            return true
        end
    end
    return false
end

--============================================================================
-- true 값 체크
-- print(gf_IsTrue("Y"))      -- true
-- print(gf_IsTrue("y"))      -- true
-- print(gf_IsTrue(true))     -- true
-- print(gf_IsTrue("true"))   -- true
-- print(gf_IsTrue("TRUE"))   -- true
-- print(gf_IsTrue("1"))      -- true
-- print(gf_IsTrue(1))        -- false (숫자 1은 제외)
-- print(gf_IsTrue(nil))      -- false
-- print(gf_IsTrue("N"))      -- false
-- print(gf_IsTrue(false))    -- false
-- print(gf_IsTrue(123))      -- false
-- print(gf_IsTrue({}))       -- false
--============================================================================
function gf_IsTrue(param)
    if param == true then
       return true
    end

    if type(param) == "string" then
       local upperParam = string.upper(param)
       return upperParam == "Y" or upperParam == "TRUE" or param == "1"
    end

    return false
end

-- 공통 오류 메시지 표시 함수
--============================================================================
function gf_ShowErrorPopup(szTranID, ErrorCode, ErrorMsg)
    ErrorMsg = gf_Trim(ErrorMsg)
	
    local szMode = Form.GetSharedData("&TEST_MODE",  false )
    --운영
    if szMode == "0" then
        local szMetaMsg = "<color=4`size=2`font=0`style=1`bgcolor=>"..ErrorMsg
        Form.MsgBoxEx("",  szMetaMsg,  "OnlyShow", "", "확인", 0)
    --개발
    else
        local szShowMsg = "서비스명 : ["..szTranID.."]\n오류코드 : ["..ErrorCode.."]\n\n"..ErrorMsg
        Form.MsgBoxEx("",  szShowMsg,  "OnlyShow", "", "확인", 0)
	end
end


-- CI 디폴트 이미지 설정하는 함수
--============================================================================
function gf_GetDefaultImg(szCode, szMarketLink, szETFData)
	local szDefaultImg = ""
    
	local szMarketText = Form.GetItemCodeInfo(szCode,  "markettext", szMarketLink)	
	if szMarketText == "Q" then
        szMarketText = "J"
    end	
	
    if szMarketText == "OV" or szMarketText == "U" then
        szDefaultImg = "img_ci_kor_index"
    elseif szMarketText == "OY" then
        local szType = Form.GetItemCodeInfo(szCode,  "stocktype", szMarketLink)
		local szMarketType = Form.GetItemCodeInfo(szCode,  "exchangecode", szMarketLink)
        if szMarketType == "0537" or szMarketType == "0321" or szMarketType == "0066" then -- 나스닥
            if szType == "EF" then
                -- 해외 ETF
                szDefaultImg = "img_ci_usa_etf"
            else
                if szMarketType == "0537" then -- 나스닥
                    szDefaultImg = "img_ci_usa_nsq"
                elseif szMarketType == "0321" then -- 뉴욕
                    szDefaultImg = "img_ci_usa_amex"
                elseif szMarketType == "0066" then -- 아멕스
                    szDefaultImg = "img_ci_usa_nys"
                end
            end
            
        elseif szMarketType == "0104" then -- 홍콩
            if szType == "EF" then
                -- 홍콩 ETF
                szDefaultImg = "img_ci_hks_etf"
            else
                szDefaultImg = "img_ci_hks_hks"
            end
            
        elseif szMarketType == "0214" or szMarketType == "0215" then
            if szType == "EF" then
                -- 중국 ETF
                szDefaultImg = "img_ci_chn_etf"
            else
                if szMarketType == "0214" then -- 심천
                    szDefaultImg = "img_ci_chn_szs"
                elseif szMarketType == "0215" then -- 상해
                    szDefaultImg = "img_ci_chn_shs"
                end
            end
        end    
        
    elseif szMarketText == "J" then
        local szType = Form.GetItemCodeInfo(szCode,  "stocktype", szMarketLink)
        if szType == "EF" then
            szDefaultImg = "img_ci_kor_etf_"..szETFData
        else
            local szMarketTypeCode = Form.GetItemCodeInfo(szCode,  "markettypecode", szMarketLink)
            if szMarketTypeCode == "K" then
                szDefaultImg = "img_ci_kor_ksp"    
            else
                szDefaultImg = "img_ci_kor_ksq"
            end
        end
        
    elseif szMarketText == "P" then -- KONEX
        szDefaultImg = "img_ci_kor_konex"
    elseif szMarketText == "T" then -- KOTC
        szDefaultImg = "img_ci_kor_kotc"
    elseif szMarketText == "SJ" then -- 신주인수권
        szDefaultImg = "img_ci_kor_preright"
    elseif szMarketText == "W" then -- ELW
        szDefaultImg = "img_ci_kor_elw"
    else
        if gf_Tonumber(string.find(szMarketText, "F")) > 0 then
            szDefaultImg = "img_ci_kor_futures"
        elseif gf_Tonumber(string.find(szMarketText, "O")) > 0 then
            szDefaultImg = "img_ci_kor_option"
        else
            szDefaultImg = "img_ci_default"
        end
    end   
	
	return szDefaultImg
end
