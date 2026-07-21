local upvalue = 4
local function sum(...)
  local values = {...}
  upvalue = upvalue + values[1] + values[2]
  return upvalue
end
local environment = {value = "env"}
local loaded = loadstring("return value")
setfenv(loaded, environment)
local meta = setmetatable({}, {__index = {value = "meta"}})
local thread = coroutine.create(function() coroutine.yield("yield"); return "done" end)
local first, yielded = coroutine.resume(thread)
local second, done = coroutine.resume(thread)
local resource, number = dofile("fixtures/multi.lua")
return table.concat({
  _VERSION,
  tostring(sum(1, 2)),
  loaded(),
  tostring(getfenv(loaded) == environment),
  meta.value,
  tostring(first), yielded, tostring(second), done,
  table.concat({unpack({"u", "v"})}, ""),
  string.upper("string"), tostring(math.floor(3.9)),
  resource .. tostring(number),
  NativeGlobal(), Form:probe(), DATAMANAGER:probe(),
  Control.caption, Control:ping()
}, "|")
