local marker, number = dofile("fixtures/multi.lua")
if marker ~= "resource" or number ~= 51 then error("fixture") end

function Success(value)
  Input.caption = value
  Action.border = "solid"
  Action.dfgcolor = "blue"
  Action.enable = true
  Action:SetRadius(1, "a", "b", "c", false, "d", "e", "f", 0)
  Form.Toast(0, value, 1)
end

function ReadProviders()
  local value = Form.GetOpenLinkData()
  if Form.GetSharedData("shared", false) ~= "shared-value" then error("provider") end
  if Form.GetItemCodeInfo("item", "markettext", "") ~= "item-value" then error("item") end
  Input.caption = Trim(value)
end

function Rollback()
  Input.caption = "must-rollback"
  Form.Toast(0, "must-rollback", 1)
  error("redacted-value")
end

function Timeout() while true do end end
function Allocate() local values = {}; local i = 0; while true do i = i + 1; values[#values + 1] = string.rep("x", 262130) .. tostring(i) end end
function CommandOverflow() for i = 1, 1025 do Form.Toast(0, "x", 1) end end

function DATAMANAGER_OnSendTranBefore(tranId)
  DATAMANAGER.SetDataValue(false, tranId, "input", "value", 0, "sent")
end

function Request()
  DATAMANAGER.RequestTranData("T_ALPHA")
end

function RequestMany()
  for i = 1, 33 do DATAMANAGER.RequestTranData("T_ALPHA") end
end

function DATAMANAGER_OnReceiveTranComplete(tranId)
  Form.Toast(0, DATAMANAGER.GetDataValue(false, tranId, "output", "value", 0), 1)
end

function DATAMANAGER_OnReceiveTranError(tranId, code, message)
  Form.Toast(0, code, 1)
end

function CloseTwice()
  Form.CloseForm()
  Form.CloseForm()
end

function ReturnAndClose()
  Form.SendReturnToParent("result", "payload", true)
end

function Form_OnFormClose()
  Form.Toast(0, "closing", 1)
end

function Noop() end

function CommandLimit()
  for i = 1, 1024 do Form.Toast(0, "x", 1) end
end

function CommandBytes()
  local value = string.rep("x", 4096)
  for i = 1, 1024 do Form.Toast(0, value, 1) end
end

function StageOverflow()
  local value = string.rep("x", 262144)
  for i = 1, 17 do DATAMANAGER.SetDataValue(false, "T_ALPHA", "input", "value", 0, value) end
end

function Grow(startIndex, count)
  local value = string.rep("g", 200000)
  for i = startIndex, startIndex + count - 1 do DATAMANAGER.SetDataValue(false, "T_ALPHA", "input", "value", i, value) end
end

function Request32()
  for i = 1, 32 do DATAMANAGER.RequestTranData("T_ALPHA") end
end

local fail_send_before = false
function NestedFailure()
  fail_send_before = true
  DATAMANAGER.RequestTranData("T_ALPHA")
end

local close_error = false
function CloseError()
  close_error = true
  Form.CloseForm()
end

function CloseSlow()
  local value = 0
  for i = 1, 100000 do value = value + i end
  Form.CloseForm()
end

function DofileMulti()
  local value, number = dofile("fixtures/multi.lua")
  if value ~= "resource" or number ~= 51 then error("dofile") end
end

function DofileMissing()
  dofile("fixtures/not-listed.lua")
end

local original_send_before = DATAMANAGER_OnSendTranBefore
function DATAMANAGER_OnSendTranBefore(tranId)
  if fail_send_before then error("send-before-redacted") end
  original_send_before(tranId)
end

local original_close = Form_OnFormClose
function Form_OnFormClose()
  if close_error then error("close-redacted") end
  original_close()
end

function DofileTraversal()
  dofile("../fixtures/multi.lua")
end

function DofileHashMismatch()
  dofile("fixtures/hash-mismatch.lua")
end

function ErrorValue(value)
  error(value)
end

function HostMax(value)
  Input.caption = Trim(value)
end

function HostBoundary()
  if DATAMANAGER.GetDataCount(false, "T_ALPHA", "input") ~= 0 then error("count") end
  Form.MsgBoxEx("title", "message", "key", "", "confirm", 0)
end

function BadCount()
  DATAMANAGER.GetDataCount(false, "T_ALPHA", "missing")
end

function BadTrim()
  Trim(" whitespace")
end
