#include "allnewmts_lua_adapters.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

typedef struct {
  const char *name;
  AllNewMTSLua *(*create)(void);
  int (*evaluate)(AllNewMTSLua *, const char *, char *, size_t, char *, size_t);
  void (*destroy)(AllNewMTSLua *);
} Adapter;

static void fail(const char *message) {
  fprintf(stderr, "FAIL native harness: %s\n", message);
  exit(1);
}

static char *read_file(const char *path) {
  FILE *file = fopen(path, "rb");
  long length;
  char *bytes;
  if (!file) fail("fixture open");
  fseek(file, 0, SEEK_END); length = ftell(file); rewind(file);
  bytes = (char *)malloc((size_t)length + 1);
  if (!bytes || fread(bytes, 1, (size_t)length, file) != (size_t)length) fail("fixture read");
  bytes[length] = 0; fclose(file);
  return bytes;
}

static void expect(Adapter adapter, AllNewMTSLua *runtime, const char *source, const char *expected) {
  char result[4096] = {0}, error[4096] = {0};
  if (!adapter.evaluate(runtime, source, result, sizeof(result), error, sizeof(error))) {
    fprintf(stderr, "%s error: %s\n", adapter.name, error);
    fail("unexpected Lua error");
  }
  if (strcmp(result, expected) != 0) {
    fprintf(stderr, "%s expected <%s>, got <%s>\n", adapter.name, expected, result);
    fail("unexpected Lua result");
  }
}

static void expect_rejected(Adapter adapter, AllNewMTSLua *runtime, const char *path) {
  char source[512];
  snprintf(source, sizeof(source), "local ok=pcall(dofile,%s); return tostring(ok)", path);
  expect(adapter, runtime, source, "false");
}

static void run_adapter(Adapter adapter, const char *fixture, const char *golden) {
  const struct { const char *source; const char *expected; } cases[] = {
    {"return _VERSION", "Lua 5.1"},
    {"local x=2; local function f(y) x=x+y; return x end; return f(5)", "7"},
    {"local function f(...) return select('#',...)..':'..select(2,...) end; return f('a','b','c')", "3:b"},
    {"local f=loadstring('return x'); local e={x='env'}; setfenv(f,e); return f()..':'..tostring(getfenv(f)==e)", "env:true"},
    {"local t=setmetatable({},{__index={x='meta'}}); return t.x", "meta"},
    {"local c=coroutine.create(function() coroutine.yield('y'); return 'z' end); local a,b=coroutine.resume(c); local d,e=coroutine.resume(c); return tostring(a)..b..tostring(d)..e", "trueytruez"},
    {"return table.concat({unpack({'u','v'})},'')..':'..string.upper('s')..':'..math.floor(2.9)", "uv:S:2"},
    {"local ok,e=pcall(function() error('protected') end); return tostring(ok)..':'..tostring(string.find(e,'protected')~=nil)", "false:true"},
    {"return type(loadfile)..':'..type(package)..':'..type(io)..':'..type(os)..':'..type(debug)", "nil:nil:nil:nil:nil"},
    {"local a,b=dofile('fixtures/multi.lua'); return a..':'..b", "resource:51"},
    {"local ok,e=pcall(dofile,'fixtures/error.lua'); return tostring(ok)..':'..tostring(string.find(e,'resource%-error')~=nil)", "false:true"},
    {"return NativeGlobal()..':'..Form:probe()..':'..DATAMANAGER:probe()..':'..Control.caption..':'..Control:ping()", "global:form:data:property:method"}
  };
  size_t i;
  for (i = 0; i < 3; i++) {
    AllNewMTSLua *runtime = adapter.create();
    if (!runtime) fail("create");
    expect(adapter, runtime, fixture, golden);
    for (size_t j = 0; j < sizeof(cases) / sizeof(cases[0]); j++) expect(adapter, runtime, cases[j].source, cases[j].expected);
    expect_rejected(adapter, runtime, "'/absolute.lua'");
    expect_rejected(adapter, runtime, "'../outside.lua'");
    expect_rejected(adapter, runtime, "'fixtures\\\\outside.lua'");
    expect_rejected(adapter, runtime, "'fixtures/'..string.char(0)..'x.lua'");
    expect_rejected(adapter, runtime, "'fixtures/unlisted.lua'");
    expect_rejected(adapter, runtime, "'fixtures/hash-mismatch.lua'");
    adapter.destroy(runtime);
  }
}

static void run_guards(Adapter adapter) {
  char result[32] = {0}, error[256] = {0};
  AllNewMTSLua *runtime = adapter.create();
  clock_t started = clock();
  if (!runtime) fail("guard create");
  if (adapter.evaluate(runtime, "return string.rep('x', 40*1024*1024)", result, sizeof(result), error, sizeof(error))) fail("allocation guard accepted input");
  if (adapter.evaluate(runtime, "return 'alive'", result, sizeof(result), error, sizeof(error)) || strcmp(error, "STATE_DESTROYED") != 0) fail("allocation guard kept state alive");
  adapter.destroy(runtime);

  runtime = adapter.create();
  if (!runtime) fail("deadline create");
  if (adapter.evaluate(runtime, "while true do end", result, sizeof(result), error, sizeof(error))) fail("deadline guard accepted input");
  if (adapter.evaluate(runtime, "return 'alive'", result, sizeof(result), error, sizeof(error)) || strcmp(error, "STATE_DESTROYED") != 0) fail("deadline guard kept state alive");
  adapter.destroy(runtime);
  if ((double)(clock() - started) / CLOCKS_PER_SEC > 2.0) fail("guard responsiveness budget");
}

int main(int argc, char **argv) {
  Adapter adapters[] = {
    {"ios", allnewmts_lua_ios_create, allnewmts_lua_ios_evaluate, allnewmts_lua_ios_destroy},
    {"android", allnewmts_lua_android_create, allnewmts_lua_android_evaluate, allnewmts_lua_android_destroy}
  };
  char *fixture, *golden;
  size_t i;
  if (argc != 3) fail("expected fixture and golden paths");
  fixture = read_file(argv[1]); golden = read_file(argv[2]);
  golden[strcspn(golden, "\r\n")] = 0;
  for (i = 0; i < sizeof(adapters) / sizeof(adapters[0]); i++) {
    run_adapter(adapters[i], fixture, golden);
    run_guards(adapters[i]);
  }
  free(fixture); free(golden);
  puts("PASS native harness: shared Lua 5.1 semantics, sandbox, resources, callbacks, guards, and adapter golden");
  return 0;
}
