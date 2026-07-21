local marker, number = dofile("fixtures/multi.lua")
if marker ~= "resource" or number ~= 51 then error("fixture") end

function Success(value)
  if Input.caption ~= value then error("pre-handler mutation") end
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
  if Trim(value) ~= "open" then error("trim") end
end

function Rollback()
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

function RequestLargeName()
  DATAMANAGER.RequestTranData(Form.GetSharedData("longTransaction", false))
end

local function requestLargeNames(count)
  local transaction = Form.GetSharedData("longTransaction", false)
  local block = Form.GetSharedData("longBlock", false)
  local value = string.rep("q", 262144)
  for index = 0, count - 1 do
    DATAMANAGER.SetDataValue(false, transaction, block, "value", index, value)
  end
  DATAMANAGER.RequestTranData(transaction)
end

function LargeRequestTwo() requestLargeNames(2) end
function LargeRequestThree() requestLargeNames(3) end

local fail_send_before = false
function NestedFailure()
  fail_send_before = true
  DATAMANAGER.RequestTranData("T_ALPHA")
end

local close_error = false
local close_command_limit = false
function CloseError()
  close_error = true
  Form.CloseForm()
end

function CloseCommandLimit()
  close_command_limit = true
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
  if tranId == "T_ALPHA" then original_send_before(tranId) end
end

local original_close = Form_OnFormClose
function Form_OnFormClose()
  if close_error then error("close-redacted") end
  if close_command_limit then for i = 1, 1022 do Form.Toast(0, "x", 1) end end
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
  if Trim(value) ~= value then error("trim") end
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

function EditWrite()
  Input.caption = "forbidden"
end

function ButtonRead()
  return Action.border
end

function ClobberHost()
  Form = nil
end

function ReplaceHostTable()
  Form = {}
end

function ReplaceHostFunction()
  Trim = function(value) return value end
end

function ReplaceHostMember()
  rawset(Form, "Toast", function() end)
end

function AddHostMember()
  rawset(DATAMANAGER, "Undeclared", function() end)
end

function ReplaceHostMetatable()
  setmetatable(Form, {})
end

function ReplaceControlMetatable()
  setmetatable(Action, {})
end

function ReplaceGlobalAlias()
  _G = {}
end
