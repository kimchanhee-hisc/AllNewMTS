function StartReal()
  DATAMANAGER.RequestRealData("S00")
end

function DATAMANAGER_OnSendRealBefore(tranId)
  DATAMANAGER.SetDataValue(true, tranId, "InBlock1", "CODE", 0, "005930")
end

function DATAMANAGER_OnReceiveRealData(tranId)
  local sign = DATAMANAGER.GetDataValue(
      true, tranId, "OutBlock1", "PRDY_VRSS_SIGN", 0)
  if sign == "C" then
    DATAMANAGER.SetDataValue(
        true, tranId, "OutBlock1", "PRDY_VRSS_SIGN", 0, "2")
  end
end

function DATAMANAGER_OnReceiveRealComplete(tranId)
  local price = DATAMANAGER.GetDataValue(
      true, tranId, "OutBlock1", "STCK_PRPR", 0)
  local sign = DATAMANAGER.GetDataValue(
      true, tranId, "OutBlock1", "PRDY_VRSS_SIGN", 0)
  Form.Toast(0, price .. ":" .. sign, 1)
end

function CancelReal()
  DATAMANAGER.CancelRealData("S00")
end

function CloseReal()
  Form.CloseForm()
end

local closeError = false

function CloseRealError()
  closeError = true
  Form.CloseForm()
end

function Form_OnFormClose()
  if closeError then
    error("realtime-close-error")
  end
end
