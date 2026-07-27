#include "allnewmts_lua_adapters.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
int main(void){char out[128]={0},error[128]={0};AllNewMTSLua *a=allnewmts_lua_ios_create(),*b=allnewmts_lua_android_create();assert(a&&b);const char *probe="local a,b=dofile('fixtures/multi.lua'); assert(loadfile==nil and package==nil and io==nil and os==nil and debug==nil); assert(Form.probe()=='form' and DATAMANAGER.probe()=='data' and Control.caption=='property' and Control:ping()=='method'); return a..b";assert(allnewmts_lua_ios_evaluate(a,probe,out,sizeof(out),error,sizeof(error))&&strcmp(out,"resource51")==0);memset(out,0,sizeof(out));assert(allnewmts_lua_android_evaluate(b,"return _VERSION",out,sizeof(out),error,sizeof(error))&&strcmp(out,"Lua 5.1")==0);allnewmts_lua_ios_destroy(a);allnewmts_lua_android_destroy(b);puts("PASS narrow verification harness smokes");}
