#include "allnewmts_runtime_adapters.h"

#include <cassert>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <cstring>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <mutex>
#include <string>
#include <thread>
#include <utility>
#include <vector>
#include <atomic>

struct Capture { std::mutex mutex; std::condition_variable cv; std::vector<std::string> outputs; int releases=0; bool block_sink=false,release_sink=false,reenter=false;uint32_t reentrant_dispatch=UINT32_MAX,reentrant_destroy=UINT32_MAX; };
static void sink(void *opaque,uint64_t runtime_id,const uint8_t *bytes,size_t size){static std::atomic<uint64_t> sequence{0};auto *capture=(Capture*)opaque;std::unique_lock<std::mutex> lock(capture->mutex);capture->outputs.emplace_back((const char*)bytes,size);if(const char *directory=std::getenv("ALLNEWMTS_RUNTIME_CAPTURE_DIR")){std::ofstream file(std::string(directory)+"/"+std::to_string(sequence.fetch_add(1))+".json",std::ios::binary);file.write((const char*)bytes,(std::streamsize)size);assert(file.good());}if(capture->reenter){const char *event="{\"schemaVersion\":1,\"kind\":\"handler\",\"baseRevision\":\"1\",\"handler\":\"Noop\",\"arguments\":[],\"controlMutations\":[]}";capture->reentrant_dispatch=allnewmts_runtime_ios_dispatch(runtime_id,(const uint8_t*)event,std::strlen(event)).code;capture->reentrant_destroy=allnewmts_runtime_ios_destroy(runtime_id).code;capture->reenter=false;}capture->cv.notify_all();capture->cv.wait(lock,[&]{return !capture->block_sink||capture->release_sink;});}
static void release(void *opaque){auto *capture=(Capture*)opaque;{std::lock_guard<std::mutex> lock(capture->mutex);capture->releases++;}capture->cv.notify_all();}
static void waitFor(Capture &capture,size_t count){std::unique_lock<std::mutex> lock(capture.mutex);assert(capture.cv.wait_for(lock,std::chrono::seconds(2),[&]{return capture.outputs.size()>=count;}));}
static void waitReleased(Capture &capture){std::unique_lock<std::mutex> lock(capture.mutex);assert(capture.cv.wait_for(lock,std::chrono::seconds(2),[&]{return capture.releases==1;}));}
static void unblock(Capture &capture){{std::lock_guard<std::mutex> lock(capture.mutex);capture.release_sink=true;}capture.cv.notify_all();}
static void contains(const std::string &value,const char *needle){if(value.find(needle)==std::string::npos){std::fprintf(stderr,"missing %s in %s\n",needle,value.c_str());assert(false);}}
static size_t occurrences(const std::string &value,const char *needle){size_t count=0,position=0;while((position=value.find(needle,position))!=std::string::npos){count++;position+=std::strlen(needle);}return count;}

static std::string config(const char *path,const char *hash){
  return std::string("{\"schemaVersion\":1,\"entry\":{\"path\":\"")+path+"\",\"sha256\":\""+hash+"\"},\"host\":{\"openLinkData\":\"open\",\"sharedData\":{\"shared\":\"shared-value\"},\"itemCodeInfo\":[{\"code\":\"item\",\"kind\":\"markettext\",\"marketLink\":\"\",\"value\":\"item-value\"}]},\"controls\":[{\"id\":\"Input\",\"type\":\"Edit\",\"properties\":{\"caption\":\"initial\"}},{\"id\":\"Action\",\"type\":\"Button\",\"properties\":{\"border\":\"none\",\"dfgcolor\":\"black\",\"enabled\":false}}],\"transactions\":[{\"id\":\"T_ALPHA\",\"blocks\":[{\"id\":\"input\",\"fields\":[\"value\"]},{\"id\":\"output\",\"fields\":[\"value\"]}]}]}";
}
static std::string handler(uint64_t revision,const char *name,const char *value="value",bool mutate_caption=false){
 return std::string("{\"schemaVersion\":1,\"kind\":\"handler\",\"baseRevision\":\"")+std::to_string(revision)+"\",\"handler\":\""+name+"\",\"arguments\":[{\"type\":\"string\",\"value\":\""+value+"\"}],\"controlMutations\":"+(mutate_caption?std::string("[{\"id\":\"Input\",\"property\":\"caption\",\"value\":{\"type\":\"string\",\"value\":\"")+value+"\"}}]":"[]")+"}";
}
static std::string numberHandler(uint64_t revision,const char *name,int first,int second){
 return std::string("{\"schemaVersion\":1,\"kind\":\"handler\",\"baseRevision\":\"")+std::to_string(revision)+"\",\"handler\":\""+name+"\",\"arguments\":[{\"type\":\"number\",\"value\":"+std::to_string(first)+"},{\"type\":\"number\",\"value\":"+std::to_string(second)+"}],\"controlMutations\":[]}";
}
static AllNewMTSRuntimeResult dispatch(uint64_t id,const std::string &event){return allnewmts_runtime_ios_dispatch(id,(const uint8_t*)event.data(),event.size());}
static uint64_t tokenFrom(const std::string &value){const std::string key="\"requestToken\":\"";auto start=value.find(key);assert(start!=std::string::npos);start+=key.size();return std::stoull(value.substr(start));}
static std::string completion(uint64_t runtime,uint64_t token,const char *transaction="T_ALPHA"){
 return "{\"schemaVersion\":1,\"kind\":\"transactionComplete\",\"runtimeId\":\""+std::to_string(runtime)+"\",\"requestToken\":\""+std::to_string(token)+"\",\"tranId\":\""+transaction+"\",\"blockData\":[{\"id\":\"output\",\"rows\":[{\"index\":0,\"values\":{\"value\":{\"type\":\"string\",\"value\":\"done\"}}}]}]}";
}
static std::string realtimeConfig(const char *hash){
 return std::string("{\"schemaVersion\":1,\"entry\":{\"path\":\"fixtures/realtime-runtime.lua\",\"sha256\":\"")+hash+"\"},\"host\":{\"openLinkData\":\"\",\"sharedData\":{},\"itemCodeInfo\":[]},\"controls\":[],\"transactions\":[{\"id\":\"S00\",\"realtime\":true,\"blocks\":[{\"id\":\"InBlock1\",\"fields\":[\"CODE\"]},{\"id\":\"OutBlock1\",\"fields\":[\"SHRN_ISCD\",\"STCK_PRPR\",\"PRDY_VRSS_SIGN\",\"PRDY_VRSS\",\"PRDY_CTRT\",\"STCK_CNTG_HOUR\"]}]}]}";
}
static std::string realtimeCompletion(uint64_t runtime){
 return "{\"schemaVersion\":1,\"kind\":\"realtimeComplete\",\"runtimeId\":\""+std::to_string(runtime)+"\",\"tranId\":\"S00\",\"blockData\":[{\"id\":\"OutBlock1\",\"rows\":[{\"index\":0,\"values\":{\"SHRN_ISCD\":{\"type\":\"string\",\"value\":\"005930\"},\"STCK_PRPR\":{\"type\":\"string\",\"value\":\"71500\"},\"PRDY_VRSS_SIGN\":{\"type\":\"string\",\"value\":\"C\"},\"PRDY_VRSS\":{\"type\":\"string\",\"value\":\"700\"},\"PRDY_CTRT\":{\"type\":\"string\",\"value\":\"0.99\"},\"STCK_CNTG_HOUR\":{\"type\":\"string\",\"value\":\"091530\"}}}]}]}";
}

int main(){
  const char *hash="1e3b642aeda6de9ddbd309df8ac22ee4f3dcce78a8d166caa4e5774f39f82e09"; std::string cfg=config("fixtures/runtime-conformance.lua",hash);
  assert(!allnewmts_runtime_test_instruction_limit_exceeded(1000000));
  assert(allnewmts_runtime_test_instruction_limit_exceeded(1000001));
  size_t stage_bytes=0;assert(allnewmts_runtime_test_stage_charge(4u*1024u*1024u-1,1,&stage_bytes)&&stage_bytes==4u*1024u*1024u);assert(!allnewmts_runtime_test_stage_charge(4u*1024u*1024u,1,&stage_bytes));
  {
    uint64_t value=0;const char *maximum="18446744073709551615";assert(allnewmts_runtime_adapter_parse_id((const uint8_t*)maximum,20,&value)==0&&value==UINT64_MAX);
    for(const char *invalid:{"","0","01","-1"," 1","1 ","18446744073709551616","1x"})assert(allnewmts_runtime_adapter_parse_id((const uint8_t*)invalid,std::strlen(invalid),&value)==ALLNEWMTS_RUNTIME_INVALID_ARGUMENT);
  }
  {
    Capture capture; std::string bad="{}"; auto rejected=allnewmts_runtime_ios_create((const uint8_t*)bad.data(),bad.size(),sink,release,&capture);assert(rejected.code==ALLNEWMTS_RUNTIME_INVALID_ARGUMENT&&capture.outputs.empty()&&capture.releases==0);
    std::string drift=config("fixtures/runtime-conformance.lua","0000000000000000000000000000000000000000000000000000000000000000");rejected=allnewmts_runtime_ios_create((const uint8_t*)drift.data(),drift.size(),sink,release,&capture);assert(rejected.code==ALLNEWMTS_RUNTIME_RESOURCE_HASH_MISMATCH&&capture.outputs.empty()&&capture.releases==0);
    std::string malformed="{";assert(allnewmts_runtime_ios_dispatch(999,(const uint8_t*)malformed.data(),malformed.size()).code==ALLNEWMTS_RUNTIME_INVALID_ARGUMENT);
    std::string oversized(262145,'x');assert(allnewmts_runtime_ios_dispatch(999,(const uint8_t*)oversized.data(),oversized.size()).code==ALLNEWMTS_RUNTIME_RESOURCE_LIMIT);
    std::string oversizedConfig(4u*1024u*1024u+1,'x');rejected=allnewmts_runtime_ios_create((const uint8_t*)oversizedConfig.data(),oversizedConfig.size(),sink,release,&capture);assert(rejected.code==ALLNEWMTS_RUNTIME_RESOURCE_LIMIT&&capture.outputs.empty());
    std::string reserved=cfg;reserved.replace(reserved.find("\"Input\""),7,"\"Form\"");rejected=allnewmts_runtime_ios_create((const uint8_t*)reserved.data(),reserved.size(),sink,release,&capture);assert(rejected.code==ALLNEWMTS_RUNTIME_INVALID_ARGUMENT);
    std::string nul=cfg;nul.replace(nul.find("\"Input\""),7,"\"Form\\u0000x\"");rejected=allnewmts_runtime_ios_create((const uint8_t*)nul.data(),nul.size(),sink,release,&capture);assert(rejected.code==ALLNEWMTS_RUNTIME_INVALID_ARGUMENT);
    std::string collision=cfg;collision.replace(collision.find("\"Input\""),7,"\"Success\"");rejected=allnewmts_runtime_ios_create((const uint8_t*)collision.data(),collision.size(),sink,release,&capture);assert(rejected.code==ALLNEWMTS_RUNTIME_LOAD_ERROR);
    std::string shared="\"sharedData\":{";for(int i=0;i<11;i++){if(i)shared+=",";shared+="\"k"+std::to_string(i)+"\":\""+std::string(200000,'a')+"\"";}shared+="}";std::string arena=cfg;auto begin=arena.find("\"sharedData\"");auto end=arena.find(",\"itemCodeInfo\"",begin);arena.replace(begin,end-begin,shared);assert(arena.size()<4u*1024u*1024u);rejected=allnewmts_runtime_ios_create((const uint8_t*)arena.data(),arena.size(),sink,release,&capture);assert(rejected.code==ALLNEWMTS_RUNTIME_RESOURCE_LIMIT);
    allnewmts_runtime_test_next_lua_allocator_limit(4096);rejected=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(rejected.code==ALLNEWMTS_RUNTIME_RESOURCE_LIMIT);
  }
  {
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==ALLNEWMTS_RUNTIME_OK&&created.runtime_id);
    auto first=dispatch(created.runtime_id,handler(0,"Success","value",true));assert(first.code==ALLNEWMTS_RUNTIME_OK&&first.reserved_revision==1);waitFor(capture,1);contains(capture.outputs[0],"\"status\":\"ok\"");contains(capture.outputs[0],"\"caption\":\"value\"");
    assert(dispatch(created.runtime_id,handler(0,"Success")).code==ALLNEWMTS_RUNTIME_STALE_REVISION);
    auto failed=dispatch(created.runtime_id,handler(1,"Rollback"));assert(failed.code==ALLNEWMTS_RUNTIME_OK);waitFor(capture,2);contains(capture.outputs[1],"\"status\":\"error\"");contains(capture.outputs[1],"\"caption\":\"value\"");assert(capture.outputs[1].find("redacted-value")==std::string::npos);
    waitReleased(capture);assert(dispatch(created.runtime_id,handler(2,"Success")).code==ALLNEWMTS_RUNTIME_NOT_FOUND);assert(allnewmts_runtime_ios_destroy(created.runtime_id).code==ALLNEWMTS_RUNTIME_NOT_FOUND);
  }
  {
    for(const char *name:{"EditWrite","ButtonRead","ClobberHost","ReplaceHostTable","ReplaceHostFunction","ReplaceHostMember","AddHostMember","ReplaceHostMetatable","ReplaceControlMetatable","ReplaceGlobalAlias"}){Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);assert(dispatch(created.runtime_id,handler(0,name)).code==0);waitFor(capture,1);contains(capture.outputs[0],"\"status\":\"error\"");waitReleased(capture);}
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);std::string embedded=handler(0,"Noop");embedded.replace(embedded.find("Noop"),4,"Noop\\u0000suffix");assert(dispatch(created.runtime_id,embedded).code==ALLNEWMTS_RUNTIME_INVALID_ARGUMENT);allnewmts_runtime_ios_destroy(created.runtime_id);
  }
  {
    Capture a,b;auto one=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&a);auto two=allnewmts_runtime_android_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&b);assert(one.code==0&&two.code==0&&one.runtime_id!=two.runtime_id);
    assert(dispatch(one.runtime_id,handler(0,"Success","one",true)).code==0);std::string second=handler(0,"Success","two",true);assert(allnewmts_runtime_android_dispatch(two.runtime_id,(const uint8_t*)second.data(),second.size()).code==0);waitFor(a,1);waitFor(b,1);contains(a.outputs[0],"\"caption\":\"one\"");contains(b.outputs[0],"\"caption\":\"two\"");
    allnewmts_runtime_ios_destroy(one.runtime_id);allnewmts_runtime_android_destroy(two.runtime_id);
  }
  {
    const char *realHash="6b7849b27dae6ba549c2d9c3f2c49be22b431e6df9b602937a5997fd3017e6e5";std::string realConfig=realtimeConfig(realHash);
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)realConfig.data(),realConfig.size(),sink,release,&capture);assert(created.code==0);
    assert(dispatch(created.runtime_id,handler(0,"StartReal")).code==0);waitFor(capture,1);contains(capture.outputs[0],"\"type\":\"requestRealData\"");contains(capture.outputs[0],"\"CODE\":\"005930\"");
    assert(dispatch(created.runtime_id,realtimeCompletion(created.runtime_id)).code==0);waitFor(capture,2);contains(capture.outputs[1],"\"message\":\"71500:2\"");contains(capture.outputs[1],"\"realtime\":true");contains(capture.outputs[1],"\"event\":\"realtimeComplete\"");
    assert(dispatch(created.runtime_id,handler(2,"CancelReal")).code==0);waitFor(capture,3);contains(capture.outputs[2],"\"type\":\"cancelRealData\"");assert(dispatch(created.runtime_id,realtimeCompletion(created.runtime_id)).code==ALLNEWMTS_RUNTIME_WRONG_TRANSACTION);allnewmts_runtime_ios_destroy(created.runtime_id);waitReleased(capture);

    Capture closing;auto active=allnewmts_runtime_ios_create((const uint8_t*)realConfig.data(),realConfig.size(),sink,release,&closing);assert(active.code==0);assert(dispatch(active.runtime_id,handler(0,"StartReal")).code==0);waitFor(closing,1);assert(dispatch(active.runtime_id,handler(1,"CloseReal")).code==0);waitFor(closing,3);contains(closing.outputs[2],"\"type\":\"releaseRealScope\"");contains(closing.outputs[2],"\"type\":\"closeForm\"");waitReleased(closing);

    Capture failedClose;auto failing=allnewmts_runtime_ios_create((const uint8_t*)realConfig.data(),realConfig.size(),sink,release,&failedClose);assert(failing.code==0);assert(dispatch(failing.runtime_id,handler(0,"StartReal")).code==0);waitFor(failedClose,1);assert(dispatch(failing.runtime_id,handler(1,"CloseRealError")).code==0);waitFor(failedClose,3);auto runtimeError=failedClose.outputs[2].find("\"type\":\"runtimeError\"");auto releaseScope=failedClose.outputs[2].find("\"type\":\"releaseRealScope\"");auto closeForm=failedClose.outputs[2].find("\"type\":\"closeForm\"");assert(runtimeError!=std::string::npos&&releaseScope>runtimeError&&closeForm>releaseScope);contains(failedClose.outputs[2],"\"status\":\"error\"");waitReleased(failedClose);
  }
  {
    Capture capture;capture.reenter=true;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);assert(dispatch(created.runtime_id,handler(0,"Noop")).code==0);waitFor(capture,1);assert(capture.reentrant_dispatch==ALLNEWMTS_RUNTIME_REENTRANT_CALL&&capture.reentrant_destroy==ALLNEWMTS_RUNTIME_REENTRANT_CALL);assert(allnewmts_runtime_ios_destroy(created.runtime_id).code==0);waitReleased(capture);
  }
  {
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);assert(allnewmts_runtime_test_fail_next_native_allocation(created.runtime_id,1));assert(dispatch(created.runtime_id,handler(0,"Noop")).code==ALLNEWMTS_RUNTIME_RESOURCE_LIMIT);assert(dispatch(created.runtime_id,handler(0,"Noop")).reserved_revision==1);waitFor(capture,1);allnewmts_runtime_ios_destroy(created.runtime_id);
  }
  {
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);assert(allnewmts_runtime_test_fail_next_native_allocation(created.runtime_id,2));assert(dispatch(created.runtime_id,handler(0,"Success","mutated",true)).reserved_revision==1);waitFor(capture,1);contains(capture.outputs[0],"\"status\":\"error\"");contains(capture.outputs[0],"\"caption\":\"initial\"");waitReleased(capture);
  }
  {
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);auto request=handler(0,"Request");assert(dispatch(created.runtime_id,request).code==0);waitFor(capture,1);uint64_t token=tokenFrom(capture.outputs[0]);
    std::string complete=completion(created.runtime_id,token);std::string wrong=completion(created.runtime_id,token,"T_OTHER");assert(dispatch(created.runtime_id,wrong).code==ALLNEWMTS_RUNTIME_WRONG_TRANSACTION);
    assert(dispatch(created.runtime_id,completion(created.runtime_id+1,token)).code==ALLNEWMTS_RUNTIME_WRONG_RUNTIME);
    assert(dispatch(created.runtime_id,completion(created.runtime_id,token+999)).code==ALLNEWMTS_RUNTIME_LATE_CALLBACK);
    AllNewMTSRuntimeResult callbacks[2]{};std::thread first([&]{callbacks[0]=dispatch(created.runtime_id,complete);});std::thread second([&]{callbacks[1]=dispatch(created.runtime_id,complete);});first.join();second.join();assert((callbacks[0].code==0&&callbacks[1].code==ALLNEWMTS_RUNTIME_DUPLICATE_CALLBACK)||(callbacks[1].code==0&&callbacks[0].code==ALLNEWMTS_RUNTIME_DUPLICATE_CALLBACK));waitFor(capture,2);contains(capture.outputs[1],"done");allnewmts_runtime_ios_destroy(created.runtime_id);
  }
  {
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);assert(dispatch(created.runtime_id,handler(0,"Request32")).code==0);waitFor(capture,1);AllNewMTSRuntimeTestCounters counters{};assert(allnewmts_runtime_test_counters(created.runtime_id,&counters));assert(counters.outstanding_tokens==32);allnewmts_runtime_ios_destroy(created.runtime_id);
  }
  {
    std::string transaction(262144,'t'),large=cfg;auto shared=large.find("\"sharedData\":{\"shared\":\"shared-value\"}");large.replace(shared,std::strlen("\"sharedData\":{\"shared\":\"shared-value\"}"),"\"sharedData\":{\"shared\":\"shared-value\",\"longTransaction\":\""+transaction+"\"}");auto transactionId=large.find("\"id\":\"T_ALPHA\"");large.replace(transactionId,std::strlen("\"id\":\"T_ALPHA\""),"\"id\":\""+transaction+"\"");
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)large.data(),large.size(),sink,release,&capture);assert(created.code==0);for(uint64_t revision=0;revision<32;revision++){assert(dispatch(created.runtime_id,handler(revision,"RequestLargeName")).code==0);waitFor(capture,revision+1);contains(capture.outputs[revision],"\"status\":\"ok\"");}assert(dispatch(created.runtime_id,handler(32,"Noop")).code==0);waitFor(capture,33);contains(capture.outputs[32],"\"status\":\"ok\"");AllNewMTSRuntimeTestCounters counters{};assert(allnewmts_runtime_test_counters(created.runtime_id,&counters));assert(counters.outstanding_tokens==32&&counters.outstanding_token_bytes==32*transaction.size());assert(counters.last_staged_bytes<=4u*1024u*1024u&&counters.token_commit_copied_bytes==0);allnewmts_runtime_ios_destroy(created.runtime_id);
  }
  {
    Capture first,second;auto one=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&first);auto two=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&second);assert(one.code==0&&two.code==0);assert(allnewmts_runtime_test_pause_next_request(one.runtime_id));assert(dispatch(one.runtime_id,handler(0,"Request")).code==0);assert(allnewmts_runtime_test_wait_request_prepared(one.runtime_id));auto start=std::chrono::steady_clock::now();assert(dispatch(one.runtime_id,handler(1,"Noop")).code==0);assert(std::chrono::steady_clock::now()-start<std::chrono::milliseconds(50));assert(dispatch(two.runtime_id,handler(0,"Request")).code==0);waitFor(second,1);assert(allnewmts_runtime_test_resume_request(one.runtime_id));waitFor(first,2);assert(tokenFrom(first.outputs[0])<tokenFrom(second.outputs[0]));allnewmts_runtime_ios_destroy(one.runtime_id);allnewmts_runtime_ios_destroy(two.runtime_id);
  }
  {
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);assert(dispatch(created.runtime_id,handler(0,"NestedFailure")).code==0);waitFor(capture,1);contains(capture.outputs[0],"\"status\":\"error\"");assert(capture.outputs[0].find("requestTranData")==std::string::npos);assert(capture.outputs[0].find("send-before-redacted")==std::string::npos);allnewmts_runtime_ios_destroy(created.runtime_id);
  }
  {
    for(const char *name:{"CommandOverflow","CommandBytes","StageOverflow","RequestMany"}) { Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);assert(dispatch(created.runtime_id,handler(0,name)).code==0);waitFor(capture,1);contains(capture.outputs[0],"RESOURCE_LIMIT");contains(capture.outputs[0],"\"commands\":[{\"code\":\"RESOURCE_LIMIT\",\"type\":\"runtimeError\"}]");allnewmts_runtime_ios_destroy(created.runtime_id); }
  }
  {
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);assert(dispatch(created.runtime_id,handler(0,"CommandLimit")).code==0);waitFor(capture,1);contains(capture.outputs[0],"\"status\":\"ok\"");assert(occurrences(capture.outputs[0],"\"type\":\"toast\"")==1024);AllNewMTSRuntimeTestCounters counters{};assert(allnewmts_runtime_test_counters(created.runtime_id,&counters));assert(counters.allocator_peak<=32u*1024u*1024u);allnewmts_runtime_ios_destroy(created.runtime_id);
  }
  {
    Capture capture;capture.block_sink=true;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);assert(dispatch(created.runtime_id,handler(0,"Allocate")).code==0);waitFor(capture,1);contains(capture.outputs[0],"RESOURCE_LIMIT");AllNewMTSRuntimeTestCounters counters{};assert(allnewmts_runtime_test_counters(created.runtime_id,&counters));assert(counters.allocator_current<=32u*1024u*1024u&&counters.allocator_peak<=32u*1024u*1024u&&counters.allocator_peak>24u*1024u*1024u);unblock(capture);waitReleased(capture);assert(!allnewmts_runtime_test_counters(created.runtime_id,&counters));
  }
  {
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);for(int i=0;i<2;i++){assert(dispatch(created.runtime_id,numberHandler(i,"Grow",i*15,15)).code==0);waitFor(capture,i+1);}assert(dispatch(created.runtime_id,numberHandler(2,"Grow",30,15)).code==0);waitFor(capture,3);contains(capture.outputs[2],"RESOURCE_LIMIT");AllNewMTSRuntimeTestCounters counters{};assert(allnewmts_runtime_test_counters(created.runtime_id,&counters));assert(counters.committed_bytes<8u*1024u*1024u&&counters.committed_bytes>5u*1024u*1024u);allnewmts_runtime_ios_destroy(created.runtime_id);
  }
  {
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);for(int i=0;i<2;i++){assert(dispatch(created.runtime_id,numberHandler(i,"Grow",i*15,15)).code==0);waitFor(capture,i+1);}assert(dispatch(created.runtime_id,handler(2,"Request")).code==0);waitFor(capture,3);contains(capture.outputs[2],"RESOURCE_LIMIT");assert(capture.outputs[2].find("requestTranData")==std::string::npos);waitReleased(capture);
  }
  {
    std::string transaction(262144,'t'),block(262144,'b'),large=cfg;auto shared=large.find("\"sharedData\":{\"shared\":\"shared-value\"}");large.replace(shared,std::strlen("\"sharedData\":{\"shared\":\"shared-value\"}"),"\"sharedData\":{\"shared\":\"shared-value\",\"longTransaction\":\""+transaction+"\",\"longBlock\":\""+block+"\"}");auto transactionId=large.find("\"id\":\"T_ALPHA\"");large.replace(transactionId,std::strlen("\"id\":\"T_ALPHA\""),"\"id\":\""+transaction+"\"");auto blockId=large.find("\"id\":\"input\"",transactionId);large.replace(blockId,std::strlen("\"id\":\"input\""),"\"id\":\""+block+"\"");
    Capture accepted;auto two=allnewmts_runtime_ios_create((const uint8_t*)large.data(),large.size(),sink,release,&accepted);assert(two.code==0);assert(dispatch(two.runtime_id,handler(0,"LargeRequestTwo")).code==0);waitFor(accepted,1);contains(accepted.outputs[0],"\"status\":\"ok\"");contains(accepted.outputs[0],"requestTranData");allnewmts_runtime_ios_destroy(two.runtime_id);
    Capture rejected;auto three=allnewmts_runtime_ios_create((const uint8_t*)large.data(),large.size(),sink,release,&rejected);assert(three.code==0);assert(dispatch(three.runtime_id,handler(0,"LargeRequestThree")).code==0);waitFor(rejected,1);contains(rejected.outputs[0],"RESOURCE_LIMIT");assert(rejected.outputs[0].find("requestTranData")==std::string::npos);waitReleased(rejected);
  }
  {
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);AllNewMTSRuntimeTestCounters counters{};assert(allnewmts_runtime_test_counters(created.runtime_id,&counters));assert(allnewmts_runtime_test_lua_allocator_limit(created.runtime_id,counters.allocator_current));std::string large(200000,'u');assert(dispatch(created.runtime_id,handler(0,"HostMax",large.c_str())).code==0);waitFor(capture,1);contains(capture.outputs[0],"RESOURCE_LIMIT");waitReleased(capture);
  }
  {
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);assert(dispatch(created.runtime_id,handler(0,"CloseTwice")).code==0);waitFor(capture,2);contains(capture.outputs[0],"DUPLICATE_CLOSE");contains(capture.outputs[1],"\"type\":\"closeForm\"");allnewmts_runtime_ios_destroy(created.runtime_id);assert(capture.releases==1);
  }
  {
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);assert(dispatch(created.runtime_id,handler(0,"CloseError")).code==0);waitFor(capture,2);contains(capture.outputs[1],"\"status\":\"error\"");auto runtimeError=capture.outputs[1].find("\"type\":\"runtimeError\"");auto closeForm=capture.outputs[1].find("\"type\":\"closeForm\"");assert(runtimeError!=std::string::npos&&closeForm>runtimeError&&capture.outputs[1].find("close-redacted")==std::string::npos);allnewmts_runtime_ios_destroy(created.runtime_id);assert(capture.releases==1);
  }
  {
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);assert(dispatch(created.runtime_id,handler(0,"CloseCommandLimit")).code==0);waitFor(capture,2);assert(occurrences(capture.outputs[1],"\"type\":\"toast\"")==1023);assert(occurrences(capture.outputs[1],"\"type\":\"closeForm\"")==1);assert(capture.outputs[1].rfind("\"type\":\"closeForm\"")>capture.outputs[1].rfind("\"type\":\"toast\""));allnewmts_runtime_ios_destroy(created.runtime_id);
  }
  {
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);assert(dispatch(created.runtime_id,handler(0,"Request")).code==0);waitFor(capture,1);uint64_t token=tokenFrom(capture.outputs[0]);assert(dispatch(created.runtime_id,handler(1,"CloseTwice")).code==0);waitFor(capture,3);waitReleased(capture);assert(dispatch(created.runtime_id,completion(created.runtime_id,token)).code==ALLNEWMTS_RUNTIME_NOT_FOUND);assert(allnewmts_runtime_ios_destroy(created.runtime_id).code==ALLNEWMTS_RUNTIME_NOT_FOUND);
  }
  {
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);assert(dispatch(created.runtime_id,handler(0,"CloseSlow")).code==0);assert(dispatch(created.runtime_id,handler(1,"Noop")).code==0);waitFor(capture,2);std::this_thread::sleep_for(std::chrono::milliseconds(20));assert(capture.outputs.size()==2);allnewmts_runtime_ios_destroy(created.runtime_id);
  }
  {
    std::string closeConfig=config("fixtures/runtime-no-close.lua","581d3fff405afcbdd50415e67c84f37e802d571f81c8cc39b7e70780070a6bd9");Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)closeConfig.data(),closeConfig.size(),sink,release,&capture);assert(created.code==0);assert(dispatch(created.runtime_id,handler(0,"CloseNow")).code==0);waitFor(capture,2);contains(capture.outputs[0],"\"nextLifecycle\":\"CLOSING\"");contains(capture.outputs[1],"\"type\":\"closeForm\"");contains(capture.outputs[1],"\"nextLifecycle\":\"CLOSED\"");waitReleased(capture);assert(dispatch(created.runtime_id,handler(2,"CloseNow")).code==ALLNEWMTS_RUNTIME_NOT_FOUND);assert(allnewmts_runtime_ios_destroy(created.runtime_id).code==ALLNEWMTS_RUNTIME_NOT_FOUND);
  }
  {
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);auto start=std::chrono::steady_clock::now();assert(dispatch(created.runtime_id,handler(0,"Timeout")).code==0);waitFor(capture,1);assert(std::chrono::steady_clock::now()-start<std::chrono::seconds(1));contains(capture.outputs[0],"EXECUTION_TIMEOUT");allnewmts_runtime_ios_destroy(created.runtime_id);
  }
  {
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);std::string marker(200000,'z');assert(dispatch(created.runtime_id,handler(0,"ErrorValue",marker.c_str())).code==0);waitFor(capture,1);assert(capture.outputs[0].size()<65536&&capture.outputs[0].find(marker)==std::string::npos);allnewmts_runtime_ios_destroy(created.runtime_id);
  }
  {
    for(const char *name:{"DofileMissing","DofileTraversal","DofileHashMismatch"}){Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);assert(dispatch(created.runtime_id,handler(0,name)).code==0);waitFor(capture,1);contains(capture.outputs[0],"\"status\":\"error\"");allnewmts_runtime_ios_destroy(created.runtime_id);}Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);assert(dispatch(created.runtime_id,handler(0,"DofileMulti")).code==0);waitFor(capture,1);contains(capture.outputs[0],"\"status\":\"ok\"");allnewmts_runtime_ios_destroy(created.runtime_id);
  }
  {
    Capture capture;std::string load=config("fixtures/error.lua","7478e42425746bd4131d72bda6ee60f8f42ef9edeaff28f41c25a11c248609b5");auto rejected=allnewmts_runtime_ios_create((const uint8_t*)load.data(),load.size(),sink,release,&capture);assert(rejected.code==ALLNEWMTS_RUNTIME_LOAD_ERROR&&capture.outputs.empty()&&capture.releases==0);std::string path=config("../fixtures/runtime-conformance.lua",hash);rejected=allnewmts_runtime_ios_create((const uint8_t*)path.data(),path.size(),sink,release,&capture);assert(rejected.code==ALLNEWMTS_RUNTIME_INVALID_ARGUMENT);
  }
  {
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);std::string invalid="{";assert(dispatch(created.runtime_id,invalid).code==ALLNEWMTS_RUNTIME_INVALID_ARGUMENT);assert(dispatch(created.runtime_id,handler(0,"ReadProviders")).reserved_revision==1);waitFor(capture,1);contains(capture.outputs[0],"\"status\":\"ok\"");contains(capture.outputs[0],"\"caption\":\"initial\"");allnewmts_runtime_ios_destroy(created.runtime_id);
  }
  {
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);assert(dispatch(created.runtime_id,handler(0,"HostBoundary")).code==0);waitFor(capture,1);contains(capture.outputs[0],"\"type\":\"messageBox\"");allnewmts_runtime_ios_destroy(created.runtime_id);
    for(const auto &probe:std::vector<std::pair<const char*,const char*>>{{"BadCount","HOST_LOOKUP_MISS"},{"BadTrim","HOST_ARGUMENT_ERROR"}}){Capture failed;auto runtime=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&failed);assert(runtime.code==0);assert(dispatch(runtime.runtime_id,handler(0,probe.first)).code==0);waitFor(failed,1);contains(failed.outputs[0],probe.second);allnewmts_runtime_ios_destroy(runtime.runtime_id);}
  }
  {
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);std::string event=handler(0,"HostMax","");std::string value(262144-event.size(),'h');event=handler(0,"HostMax",value.c_str());assert(event.size()==262144);auto start=std::chrono::steady_clock::now();assert(dispatch(created.runtime_id,event).code==0);waitFor(capture,1);assert(std::chrono::steady_clock::now()-start<std::chrono::milliseconds(50));contains(capture.outputs[0],"\"status\":\"ok\"");allnewmts_runtime_ios_destroy(created.runtime_id);
  }
  {
    Capture capture;capture.block_sink=true;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);assert(dispatch(created.runtime_id,handler(0,"Noop")).code==0);waitFor(capture,1);for(uint64_t base=1;base<=64;base++)assert(dispatch(created.runtime_id,handler(base,"Noop")).code==0);assert(dispatch(created.runtime_id,handler(65,"Noop")).code==ALLNEWMTS_RUNTIME_QUEUE_LIMIT);AllNewMTSRuntimeTestCounters counters{};assert(allnewmts_runtime_test_counters(created.runtime_id,&counters));assert(counters.pending_events==64&&counters.pending_bytes<4u*1024u*1024u);unblock(capture);allnewmts_runtime_ios_destroy(created.runtime_id);assert(capture.outputs.size()==1&&capture.releases==1);
  }
  {
    Capture capture;capture.block_sink=true;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);assert(dispatch(created.runtime_id,handler(0,"Noop")).code==0);waitFor(capture,1);std::string large(250000,'q');uint64_t accepted=0;AllNewMTSRuntimeResult admission{};do{admission=dispatch(created.runtime_id,handler(accepted+1,"Noop",large.c_str()));if(admission.code==0)accepted++;}while(admission.code==0);assert(admission.code==ALLNEWMTS_RUNTIME_QUEUE_LIMIT&&accepted<20);AllNewMTSRuntimeTestCounters counters{};assert(allnewmts_runtime_test_counters(created.runtime_id,&counters));assert(counters.pending_bytes<=4u*1024u*1024u&&counters.pending_events==accepted);unblock(capture);allnewmts_runtime_ios_destroy(created.runtime_id);
  }
  {
    allnewmts_runtime_test_set_next_token_id(UINT64_MAX);Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);assert(dispatch(created.runtime_id,handler(0,"Request")).code==0);waitFor(capture,1);assert(tokenFrom(capture.outputs[0])==UINT64_MAX);assert(dispatch(created.runtime_id,handler(1,"Request")).code==0);waitFor(capture,2);contains(capture.outputs[1],"RESOURCE_LIMIT");waitReleased(capture);allnewmts_runtime_test_set_next_token_id(1000000);
  }
  {
    allnewmts_runtime_test_set_next_token_id(2000000);Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);assert(dispatch(created.runtime_id,handler(0,"Request")).code==0);waitFor(capture,1);assert(tokenFrom(capture.outputs[0])==2000000);allnewmts_runtime_test_set_next_token_id(2000000);assert(dispatch(created.runtime_id,handler(1,"Request")).code==0);waitFor(capture,2);contains(capture.outputs[1],"RESOURCE_LIMIT");waitReleased(capture);allnewmts_runtime_test_set_next_token_id(3000000);
  }
  {
    allnewmts_runtime_test_set_next_runtime_id(4000000);Capture first,collision;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&first);assert(created.code==0&&created.runtime_id==4000000);allnewmts_runtime_test_set_next_runtime_id(4000000);auto rejected=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&collision);assert(rejected.code==ALLNEWMTS_RUNTIME_RESOURCE_LIMIT);allnewmts_runtime_ios_destroy(created.runtime_id);allnewmts_runtime_test_set_next_runtime_id(UINT64_MAX);Capture maximum;auto last=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&maximum);assert(last.code==0&&last.runtime_id==UINT64_MAX);Capture exhausted;assert(allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&exhausted).code==ALLNEWMTS_RUNTIME_RESOURCE_LIMIT);allnewmts_runtime_ios_destroy(last.runtime_id);allnewmts_runtime_test_set_next_runtime_id(5000000);
  }
  {
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);assert(dispatch(created.runtime_id,handler(0,"Timeout")).code==0);auto start=std::chrono::steady_clock::now();assert(allnewmts_runtime_ios_destroy(created.runtime_id).code==0);assert(std::chrono::steady_clock::now()-start<std::chrono::seconds(1));size_t count=capture.outputs.size();std::this_thread::sleep_for(std::chrono::milliseconds(20));assert(capture.outputs.size()==count&&capture.releases==1);
  }
  std::puts("PASS production runtime conformance");
}
