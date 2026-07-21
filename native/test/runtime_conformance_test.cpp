#include "allnewmts_runtime_adapters.h"

#include <cassert>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <cstring>
#include <cstdio>
#include <mutex>
#include <string>
#include <thread>
#include <utility>
#include <vector>

struct Capture { std::mutex mutex; std::condition_variable cv; std::vector<std::string> outputs; int releases=0; bool block_sink=false,release_sink=false; };
static void sink(void *opaque,uint64_t,const uint8_t *bytes,size_t size){auto *capture=(Capture*)opaque;std::unique_lock<std::mutex> lock(capture->mutex);capture->outputs.emplace_back((const char*)bytes,size);capture->cv.notify_all();capture->cv.wait(lock,[&]{return !capture->block_sink||capture->release_sink;});}
static void release(void *opaque){auto *capture=(Capture*)opaque;{std::lock_guard<std::mutex> lock(capture->mutex);capture->releases++;}capture->cv.notify_all();}
static void waitFor(Capture &capture,size_t count){std::unique_lock<std::mutex> lock(capture.mutex);assert(capture.cv.wait_for(lock,std::chrono::seconds(2),[&]{return capture.outputs.size()>=count;}));}
static void unblock(Capture &capture){{std::lock_guard<std::mutex> lock(capture.mutex);capture.release_sink=true;}capture.cv.notify_all();}
static void contains(const std::string &value,const char *needle){if(value.find(needle)==std::string::npos){std::fprintf(stderr,"missing %s in %s\n",needle,value.c_str());assert(false);}}
static size_t occurrences(const std::string &value,const char *needle){size_t count=0,position=0;while((position=value.find(needle,position))!=std::string::npos){count++;position+=std::strlen(needle);}return count;}

static std::string config(const char *path,const char *hash){
  return std::string("{\"schemaVersion\":1,\"entry\":{\"path\":\"")+path+"\",\"sha256\":\""+hash+"\"},\"host\":{\"openLinkData\":\"open\",\"sharedData\":{\"shared\":\"shared-value\"},\"itemCodeInfo\":[{\"code\":\"item\",\"kind\":\"markettext\",\"marketLink\":\"\",\"value\":\"item-value\"}]},\"controls\":[{\"id\":\"Input\",\"type\":\"Edit\",\"properties\":{\"caption\":\"initial\"}},{\"id\":\"Action\",\"type\":\"Button\",\"properties\":{\"border\":\"none\",\"dfgcolor\":\"black\",\"enabled\":false}}],\"transactions\":[{\"id\":\"T_ALPHA\",\"blocks\":[{\"id\":\"input\",\"fields\":[\"value\"]},{\"id\":\"output\",\"fields\":[\"value\"]}]}]}";
}
static std::string handler(uint64_t revision,const char *name,const char *value="value"){
 return std::string("{\"schemaVersion\":1,\"kind\":\"handler\",\"baseRevision\":\"")+std::to_string(revision)+"\",\"handler\":\""+name+"\",\"arguments\":[{\"type\":\"string\",\"value\":\""+value+"\"}],\"controlMutations\":[]}";
}
static std::string numberHandler(uint64_t revision,const char *name,int first,int second){
 return std::string("{\"schemaVersion\":1,\"kind\":\"handler\",\"baseRevision\":\"")+std::to_string(revision)+"\",\"handler\":\""+name+"\",\"arguments\":[{\"type\":\"number\",\"value\":"+std::to_string(first)+"},{\"type\":\"number\",\"value\":"+std::to_string(second)+"}],\"controlMutations\":[]}";
}
static AllNewMTSRuntimeResult dispatch(uint64_t id,const std::string &event){return allnewmts_runtime_ios_dispatch(id,(const uint8_t*)event.data(),event.size());}
static uint64_t tokenFrom(const std::string &value){const std::string key="\"requestToken\":\"";auto start=value.find(key);assert(start!=std::string::npos);start+=key.size();return std::stoull(value.substr(start));}
static std::string completion(uint64_t runtime,uint64_t token,const char *transaction="T_ALPHA"){
 return "{\"schemaVersion\":1,\"kind\":\"transactionComplete\",\"runtimeId\":\""+std::to_string(runtime)+"\",\"requestToken\":\""+std::to_string(token)+"\",\"tranId\":\""+transaction+"\",\"blockData\":[{\"id\":\"output\",\"rows\":[{\"index\":0,\"values\":{\"value\":{\"type\":\"string\",\"value\":\"done\"}}}]}]}";
}

int main(){
  const char *hash="f3919d554aa96a902de8a7d3211b87bc569090072c5e19a5d791f1f87cc3ed22"; std::string cfg=config("fixtures/runtime-conformance.lua",hash);
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
  }
  {
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==ALLNEWMTS_RUNTIME_OK&&created.runtime_id);
    auto first=dispatch(created.runtime_id,handler(0,"Success"));assert(first.code==ALLNEWMTS_RUNTIME_OK&&first.reserved_revision==1);waitFor(capture,1);contains(capture.outputs[0],"\"status\":\"ok\"");contains(capture.outputs[0],"\"caption\":\"value\"");
    assert(dispatch(created.runtime_id,handler(0,"Success")).code==ALLNEWMTS_RUNTIME_STALE_REVISION);
    auto failed=dispatch(created.runtime_id,handler(1,"Rollback"));assert(failed.code==ALLNEWMTS_RUNTIME_OK);waitFor(capture,2);contains(capture.outputs[1],"\"status\":\"error\"");contains(capture.outputs[1],"\"caption\":\"value\"");assert(capture.outputs[1].find("redacted-value")==std::string::npos);
    assert(dispatch(created.runtime_id,handler(2,"Success")).code==ALLNEWMTS_RUNTIME_INVALID);assert(allnewmts_runtime_ios_destroy(created.runtime_id).code==ALLNEWMTS_RUNTIME_OK);assert(capture.releases==1);
  }
  {
    Capture a,b;auto one=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&a);auto two=allnewmts_runtime_android_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&b);assert(one.code==0&&two.code==0&&one.runtime_id!=two.runtime_id);
    assert(dispatch(one.runtime_id,handler(0,"Success","one")).code==0);std::string second=handler(0,"Success","two");assert(allnewmts_runtime_android_dispatch(two.runtime_id,(const uint8_t*)second.data(),second.size()).code==0);waitFor(a,1);waitFor(b,1);contains(a.outputs[0],"\"caption\":\"one\"");contains(b.outputs[0],"\"caption\":\"two\"");
    allnewmts_runtime_ios_destroy(one.runtime_id);allnewmts_runtime_android_destroy(two.runtime_id);
  }
  {
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);auto request=handler(0,"Request");assert(dispatch(created.runtime_id,request).code==0);waitFor(capture,1);uint64_t token=tokenFrom(capture.outputs[0]);
    std::string complete=completion(created.runtime_id,token);std::string wrong=completion(created.runtime_id,token,"T_OTHER");assert(dispatch(created.runtime_id,wrong).code==ALLNEWMTS_RUNTIME_WRONG_TRANSACTION);
    assert(dispatch(created.runtime_id,completion(created.runtime_id+1,token)).code==ALLNEWMTS_RUNTIME_WRONG_RUNTIME);
    assert(dispatch(created.runtime_id,completion(created.runtime_id,token+999)).code==ALLNEWMTS_RUNTIME_LATE_CALLBACK);
    assert(dispatch(created.runtime_id,complete).code==0);assert(dispatch(created.runtime_id,complete).code==ALLNEWMTS_RUNTIME_DUPLICATE_CALLBACK);waitFor(capture,2);contains(capture.outputs[1],"done");allnewmts_runtime_ios_destroy(created.runtime_id);
  }
  {
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);assert(dispatch(created.runtime_id,handler(0,"Request32")).code==0);waitFor(capture,1);AllNewMTSRuntimeTestCounters counters{};assert(allnewmts_runtime_test_counters(created.runtime_id,&counters));assert(counters.outstanding_tokens==32);allnewmts_runtime_ios_destroy(created.runtime_id);
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
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);assert(dispatch(created.runtime_id,handler(0,"Allocate")).code==0);waitFor(capture,1);contains(capture.outputs[0],"RESOURCE_LIMIT");AllNewMTSRuntimeTestCounters counters{};for(int i=0;i<50;i++){assert(allnewmts_runtime_test_counters(created.runtime_id,&counters));if(counters.allocator_current==0)break;std::this_thread::sleep_for(std::chrono::milliseconds(1));}assert(counters.allocator_current==0&&counters.allocator_peak<=32u*1024u*1024u&&counters.allocator_peak>24u*1024u*1024u);allnewmts_runtime_ios_destroy(created.runtime_id);
  }
  {
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);for(int i=0;i<2;i++){assert(dispatch(created.runtime_id,numberHandler(i,"Grow",i*15,15)).code==0);waitFor(capture,i+1);}assert(dispatch(created.runtime_id,numberHandler(2,"Grow",30,15)).code==0);waitFor(capture,3);contains(capture.outputs[2],"RESOURCE_LIMIT");AllNewMTSRuntimeTestCounters counters{};assert(allnewmts_runtime_test_counters(created.runtime_id,&counters));assert(counters.committed_bytes<8u*1024u*1024u&&counters.committed_bytes>5u*1024u*1024u);allnewmts_runtime_ios_destroy(created.runtime_id);
  }
  {
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);assert(dispatch(created.runtime_id,handler(0,"CloseTwice")).code==0);waitFor(capture,2);contains(capture.outputs[0],"DUPLICATE_CLOSE");contains(capture.outputs[1],"\"type\":\"closeForm\"");allnewmts_runtime_ios_destroy(created.runtime_id);assert(capture.releases==1);
  }
  {
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);assert(dispatch(created.runtime_id,handler(0,"CloseError")).code==0);waitFor(capture,2);contains(capture.outputs[1],"\"status\":\"error\"");auto runtimeError=capture.outputs[1].find("\"type\":\"runtimeError\"");auto closeForm=capture.outputs[1].find("\"type\":\"closeForm\"");assert(runtimeError!=std::string::npos&&closeForm>runtimeError&&capture.outputs[1].find("close-redacted")==std::string::npos);allnewmts_runtime_ios_destroy(created.runtime_id);assert(capture.releases==1);
  }
  {
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);assert(dispatch(created.runtime_id,handler(0,"Request")).code==0);waitFor(capture,1);uint64_t token=tokenFrom(capture.outputs[0]);assert(dispatch(created.runtime_id,handler(1,"CloseTwice")).code==0);waitFor(capture,3);assert(dispatch(created.runtime_id,completion(created.runtime_id,token)).code==ALLNEWMTS_RUNTIME_CANCELED_CALLBACK);allnewmts_runtime_ios_destroy(created.runtime_id);
  }
  {
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);assert(dispatch(created.runtime_id,handler(0,"CloseSlow")).code==0);assert(dispatch(created.runtime_id,handler(1,"Noop")).code==0);waitFor(capture,2);std::this_thread::sleep_for(std::chrono::milliseconds(20));assert(capture.outputs.size()==2);allnewmts_runtime_ios_destroy(created.runtime_id);
  }
  {
    std::string closeConfig=config("fixtures/runtime-no-close.lua","581d3fff405afcbdd50415e67c84f37e802d571f81c8cc39b7e70780070a6bd9");Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)closeConfig.data(),closeConfig.size(),sink,release,&capture);assert(created.code==0);assert(dispatch(created.runtime_id,handler(0,"CloseNow")).code==0);waitFor(capture,2);contains(capture.outputs[0],"\"nextLifecycle\":\"CLOSING\"");contains(capture.outputs[1],"\"type\":\"closeForm\"");contains(capture.outputs[1],"\"nextLifecycle\":\"CLOSED\"");assert(dispatch(created.runtime_id,handler(2,"CloseNow")).code==ALLNEWMTS_RUNTIME_CLOSED);allnewmts_runtime_ios_destroy(created.runtime_id);
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
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);std::string invalid="{";assert(dispatch(created.runtime_id,invalid).code==ALLNEWMTS_RUNTIME_INVALID_ARGUMENT);assert(dispatch(created.runtime_id,handler(0,"ReadProviders")).reserved_revision==1);waitFor(capture,1);contains(capture.outputs[0],"\"caption\":\"open\"");allnewmts_runtime_ios_destroy(created.runtime_id);
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
    Capture capture;auto created=allnewmts_runtime_ios_create((const uint8_t*)cfg.data(),cfg.size(),sink,release,&capture);assert(created.code==0);assert(dispatch(created.runtime_id,handler(0,"Timeout")).code==0);auto start=std::chrono::steady_clock::now();assert(allnewmts_runtime_ios_destroy(created.runtime_id).code==0);assert(std::chrono::steady_clock::now()-start<std::chrono::seconds(1));size_t count=capture.outputs.size();std::this_thread::sleep_for(std::chrono::milliseconds(20));assert(capture.outputs.size()==count&&capture.releases==1);
  }
  std::puts("PASS production runtime conformance");
}
