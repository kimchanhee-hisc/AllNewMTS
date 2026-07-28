#include "allnewmts_rest_auth.h"

#include <algorithm>
#include <cassert>
#include <condition_variable>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <map>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace {

struct Reply {
  bool transport_ok = true;
  uint16_t http_status = 200;
  std::string body;
};

struct Record {
  std::string path;
  std::map<std::string, std::string> headers;
  std::string body;
  uint32_t timeout = 0;
};

struct Fake {
  uint64_t now = 1000;
  std::vector<Reply> replies;
  std::vector<Record> records;
  size_t reply_index = 0;
  bool block_first = false;
  bool first_entered = false;
  bool release_first = false;
  std::mutex mutex;
  std::condition_variable condition;
};

int post(void *opaque, const AllNewMTSRestAuthRequest *request,
         uint16_t *http_status, uint8_t *response, size_t response_capacity,
         size_t *response_size) {
  auto &fake = *static_cast<Fake *>(opaque);
  assert(request && request->path && request->headers && request->body);
  Record record;
  record.path = request->path;
  record.body.assign(reinterpret_cast<const char *>(request->body),
                     request->body_size);
  record.timeout = request->timeout_ms;
  for (size_t index = 0; index < request->header_count; ++index) {
    assert(request->headers[index].name && request->headers[index].value);
    assert(record.headers.emplace(request->headers[index].name,
                                  request->headers[index].value)
               .second);
  }

  std::unique_lock<std::mutex> lock(fake.mutex);
  fake.records.push_back(std::move(record));
  const size_t index = fake.reply_index++;
  assert(index < fake.replies.size());
  if (fake.block_first && index == 0) {
    fake.first_entered = true;
    fake.condition.notify_all();
    fake.condition.wait(lock, [&fake] { return fake.release_first; });
  }
  const Reply reply = fake.replies[index];
  lock.unlock();
  if (!reply.transport_ok) return 0;
  assert(reply.body.size() <= response_capacity);
  *http_status = reply.http_status;
  *response_size = reply.body.size();
  std::memcpy(response, reply.body.data(), reply.body.size());
  return 1;
}

uint64_t now(void *opaque) {
  return static_cast<Fake *>(opaque)->now;
}

AllNewMTSRestAuth *create(Fake &fake) {
  const AllNewMTSRestAuthTransport transport{post, now};
  AllNewMTSRestAuth *manager = nullptr;
  assert(allnewmts_rest_auth_create("CC320", "ALLNEWMTS_APP",
                                    "synthetic-auth", "NEWMTS", &transport,
                                    &fake, &manager) ==
         ALLNEWMTS_REST_AUTH_OK);
  return manager;
}

void assertRequest(const Record &record, const char *path, uint32_t timeout,
                   const char *access_key = nullptr) {
  assert(record.path == path);
  assert(record.path.find("refresh") == std::string::npos);
  assert(record.body == R"({"client_id":"ALLNEWMTS_APP"})");
  assert(record.timeout == timeout);
  assert(record.headers.at("Content-Type") == "application/json");
  assert(record.headers.at("H_CHNL_DETL_SCD") == "CC320");
  assert(record.headers.at("auth_key") == "synthetic-auth");
  assert(record.headers.at("connection") == "keep-alive");
  assert(record.headers.at("content-language") == "ko-KR");
  assert(record.headers.at("h_hts_id") == "NEWMTS");
  if (access_key) {
    assert(record.headers.size() == 7);
    assert(record.headers.at("access_key") == access_key);
  } else {
    assert(record.headers.size() == 6);
    assert(record.headers.count("access_key") == 0);
  }
}

const AllNewMTSRestTransactionField kTr3200Input[] = {
    {"OVRS_MKT_COD", 2},
};

const AllNewMTSRestTransactionField kTr3200Output[] = {
    {"OVRS_MKT_COD", 2},
    {"OVRS_MKT_NM", 100},
    {"CRRY_COD", 3},
    {"CRRY_COD_NM", 80},
    {"NTN_COD", 3},
    {"NTN_KRL_NM", 80},
    {"OVRS_STK_CSTD_ISTT_COD", 5},
    {"CSTD_ISTT_ACNO", 30},
    {"STTL_ISTT_BIC_NO", 13},
    {"BKR_COD", 3},
    {"BKR_NM", 100},
    {"MROP_TM", 6},
    {"MRND_TM", 6},
    {"ACPL_HR_DFRN_VL", 6},
    {"WMY_RT", 17},
    {"ONL_TR_YN", 1},
    {"FEE_INCL_YN", 1},
    {"WON_WMY_USE_YN", 1},
    {"WON_WMY_USE_RTE", 17},
    {"RBNG_PSBL_YN", 1},
    {"RSEL_PSBL_YN", 1},
    {"ORD_RVSE_PSBL_YN", 1},
    {"PRT_CNCL_PSBL_YN", 1},
    {"STM_EFCE_YN", 1},
    {"ACPL_STTL_DCNT", 11},
    {"BUY_STTL_STDR_DCNT", 11},
    {"SELL_STTL_STDR_DCNT", 11},
    {"RSVN_ORD_PSBL_YN", 1},
    {"RSVN_ORD_CTRL_SCD", 1},
    {"RSVN_ACPT_STRT_TM", 6},
    {"RSVN_ACPT_END_TM", 6},
    {"MKPR_ORD_PSBL_YN", 1},
    {"IOC_ORD_PSBL_YN", 1},
    {"FOK_ORD_PSBL_YN", 1},
    {"ORD_ACPT_PSBL_YN", 1},
    {"FIX_SPCL_ACNT_ID_CTNS", 60},
    {"MOC_ORD_PSBL_YN", 1},
    {"LOCO_ORD_PSBL_YN", 1},
    {"MOO_ORD_PSBL_YN", 1},
    {"MOC_ORD_PSBL_HR", 11},
    {"LNCH_HR_USE_YN", 1},
    {"LNCH_STRT_TM", 6},
    {"LNCH_END_TM", 6},
    {"OVRS_ORD_DT", 8},
    {"BF_MKT_ORD_PSBL_YN", 1},
    {"BF_MROP_TM", 6},
    {"BF_MRND_TM", 6},
    {"DCPN_TR_PSBL_YN", 1},
    {"DCPN_TRDE_STRT_TM", 6},
    {"DCPN_TRDE_END_TM", 6},
    {"DCPN_TRDE_LMT_AMT", 19},
    {"DCPN_TRDE_ESTM_FEE_RT", 15},
    {"PFND_CSTD_ISTT_ACNO", 30},
    {"AF_MKT_ORD_PSBL_YN", 1},
    {"AF_MROP_TM", 6},
    {"AF_MRND_TM", 6},
    {"ALTN_MKT_ORD_PSBL_YN", 1},
    {"ALTN_MROP_TM", 6},
    {"ALTN_MRND_TM", 6},
    {"ALTN_MKT_BKR_COD", 3},
    {"ALTN_MKT_BKR_NM", 100},
    {"ITGR_WMY_USE_YN", 1},
};

constexpr size_t kTr3200OutputCount =
    sizeof(kTr3200Output) / sizeof(kTr3200Output[0]);

std::string tr3200Response() {
  std::string response =
      R"({"status":0,"resultCode":"00000000","resultMessage":"OK","outputData":{"outRec1":{)";
  for (size_t index = 0; index < kTr3200OutputCount; ++index) {
    if (index) response += ",";
    response += "\"";
    response += kTr3200Output[index].name;
    response += "\":\"";
    if (std::strcmp(kTr3200Output[index].name, "OVRS_MKT_COD") == 0)
      response += "01";
    else if (std::strcmp(kTr3200Output[index].name, "OVRS_MKT_NM") == 0)
      response += "\\ubbf8\\uad6d\\uc2dc\\uc7a5";
    else
      response += "X";
    response += "\"";
  }
  return response + "}}}";
}

std::vector<AllNewMTSRestTransactionOutput> tr3200Outputs(
    std::vector<std::vector<char>> &storage) {
  storage.clear();
  storage.reserve(kTr3200OutputCount);
  for (const auto &field : kTr3200Output)
    storage.emplace_back(field.maximum_size + 1);
  std::vector<AllNewMTSRestTransactionOutput> outputs;
  outputs.reserve(kTr3200OutputCount);
  for (size_t index = 0; index < kTr3200OutputCount; ++index)
    outputs.push_back({kTr3200Output[index].name, storage[index].data(),
                       storage[index].size(), 0, 0});
  return outputs;
}

void assertTransactionRequest(const Record &record, const char *token) {
  assert(record.path == "/tr/TR3200Q1");
  assert(record.body == R"({"OVRS_MKT_COD":"01"})");
  assert(record.timeout == ALLNEWMTS_REST_TRANSACTION_TIMEOUT_MS);
  assert(record.headers.at("Content-Type") == "application/json");
  assert(record.headers.at("H_CHNL_DETL_SCD") == "CC320");
  assert(record.headers.at("auth_key") == "synthetic-auth");
  assert(record.headers.at("connection") == "keep-alive");
  assert(record.headers.at("content-language") == "ko-KR");
  assert(record.headers.at("h_hts_id") == "NEWMTS");
  assert(record.headers.at("authorization") == token);
  assert(record.headers.at("H_SCREEN_FILENAME") == "HS7001S03");
  assert(record.headers.count("access_key") == 0);
}

}  // namespace

int main() {
  Fake fake;
  fake.replies = {
      {true, 200, R"({"status":0,"access_key":"key-1"})"},
      {true, 200, R"({"status":0,"access_token":"token-1"})"},
      {true, 200, R"({"access_key":"key-2","ignored":{"value":1}})"},
      {true, 200, R"({"access_token":"token-2"})"},
      {true, 200, R"({"status":0,"access_key":"key-3"})"},
      {true, 200, R"({"status":0,"access_token":"token-3"})"},
      {true, 200, R"({"status":0,"access_key":"key-4"})"},
      {true, 200, R"({"status":0,"access_token":"token-4"})"},
  };
  AllNewMTSRestAuth *manager = create(fake);
  AllNewMTSRestCredentials credentials{};
  assert(allnewmts_rest_auth_prepare(manager, 0, &credentials) ==
         ALLNEWMTS_REST_AUTH_OK);
  assert(credentials.generation == 1 && credentials.issued_at_ms == 1000);
  assert(std::strcmp(credentials.access_key, "key-1") == 0);
  assert(std::strcmp(credentials.access_token, "token-1") == 0);
  assert(fake.records.size() == 2);
  assertRequest(fake.records[0], "/clientAuth", 15000);
  assertRequest(fake.records[1], "/clientAccessToken", 15000, "key-1");

  AllNewMTSRestCredentials reused{};
  assert(allnewmts_rest_auth_prepare(manager, 0, &reused) ==
         ALLNEWMTS_REST_AUTH_OK);
  assert(reused.generation == 1 && fake.records.size() == 2);

  fake.now = 301000;
  assert(allnewmts_rest_auth_prepare(manager, 0, &credentials) ==
         ALLNEWMTS_REST_AUTH_OK);
  assert(credentials.generation == 2);
  assert(std::strcmp(credentials.access_key, "key-2") == 0);
  assert(std::strcmp(credentials.access_token, "token-2") == 0);

  assert(allnewmts_rest_auth_unauthorized(manager, 2, 401, &credentials) ==
         ALLNEWMTS_REST_AUTH_OK);
  assert(credentials.generation == 3);
  assert(std::strcmp(credentials.access_token, "token-3") == 0);
  const size_t after_reissue = fake.records.size();
  assert(allnewmts_rest_auth_unauthorized(manager, 2, 403, &credentials) ==
         ALLNEWMTS_REST_AUTH_OK);
  assert(credentials.generation == 3 && fake.records.size() == after_reissue);

  assert(allnewmts_rest_auth_prepare(manager, 1, &credentials) ==
         ALLNEWMTS_REST_AUTH_OK);
  assert(credentials.generation == 4);
  assertRequest(fake.records[2], "/clientAuth", 15000);
  assertRequest(fake.records[3], "/clientAccessToken", 15000, "key-2");
  assertRequest(fake.records[4], "/clientAuth", 15000);
  assertRequest(fake.records[5], "/clientAccessToken", 15000, "key-3");
  assertRequest(fake.records[6], "/clientAuth", 15000);
  assertRequest(fake.records[7], "/clientAccessToken", 15000, "key-4");
  allnewmts_rest_auth_destroy(manager);

  Fake retry;
  retry.replies = {
      {true, 200, R"({"status":0,"access_key":"discarded-key"})"},
      {true, 200, R"({"status":0,"access_token":""})"},
      {true, 200, R"({"status":0,"access_key":"retry-key"})"},
      {true, 200, R"({"status":0,"access_token":"retry-token"})"},
  };
  manager = create(retry);
  assert(allnewmts_rest_auth_prepare(manager, 0, &credentials) ==
         ALLNEWMTS_REST_AUTH_OK);
  assert(credentials.generation == 1);
  assert(retry.records.size() == 4);
  assertRequest(retry.records[0], "/clientAuth", 15000);
  assertRequest(retry.records[1], "/clientAccessToken", 15000,
                "discarded-key");
  assertRequest(retry.records[2], "/clientAuth", 20000);
  assertRequest(retry.records[3], "/clientAccessToken", 20000, "retry-key");
  allnewmts_rest_auth_destroy(manager);

  Fake failure;
  failure.replies = {
      {true, 200, R"({"status":0,"access_key":"initial-key"})"},
      {true, 200, R"({"status":0,"access_token":"initial-token"})"},
      {false, 0, ""}, {false, 0, ""}, {false, 0, ""}, {false, 0, ""},
  };
  manager = create(failure);
  assert(allnewmts_rest_auth_prepare(manager, 0, &credentials) ==
         ALLNEWMTS_REST_AUTH_OK);
  assert(allnewmts_rest_auth_prepare(manager, 1, &credentials) ==
         ALLNEWMTS_REST_AUTH_TRANSPORT_ERROR);
  assert(allnewmts_rest_auth_snapshot(manager, &credentials) ==
         ALLNEWMTS_REST_AUTH_NOT_READY);
  assert(failure.records[2].timeout == 15000);
  assert(failure.records[3].timeout == 20000);
  assert(failure.records[4].timeout == 30000);
  assert(failure.records[5].timeout == 45000);
  allnewmts_rest_auth_destroy(manager);

  Fake concurrent;
  concurrent.block_first = true;
  concurrent.replies = {
      {true, 200, R"({"status":0,"access_key":"shared-key"})"},
      {true, 200, R"({"status":0,"access_token":"shared-token"})"},
  };
  manager = create(concurrent);
  AllNewMTSRestCredentials first{}, second{};
  uint32_t first_result = 99, second_result = 99;
  std::thread first_thread([&] {
    first_result = allnewmts_rest_auth_prepare(manager, 1, &first);
  });
  {
    std::unique_lock<std::mutex> lock(concurrent.mutex);
    concurrent.condition.wait(lock,
                              [&concurrent] { return concurrent.first_entered; });
  }
  std::thread second_thread([&] {
    second_result = allnewmts_rest_auth_prepare(manager, 1, &second);
  });
  {
    std::lock_guard<std::mutex> lock(concurrent.mutex);
    concurrent.release_first = true;
  }
  concurrent.condition.notify_all();
  first_thread.join();
  second_thread.join();
  assert(first_result == ALLNEWMTS_REST_AUTH_OK);
  assert(second_result == ALLNEWMTS_REST_AUTH_OK);
  assert(first.generation == 1 && second.generation == 1);
  assert(concurrent.records.size() == 2);
  allnewmts_rest_auth_destroy(manager);

  Fake transaction;
  transaction.replies = {
      {true, 200, R"({"status":0,"access_key":"tr-key-1"})"},
      {true, 200, R"({"status":0,"access_token":"tr-token-1"})"},
      {true, 200, R"({"status":403})"},
      {true, 200, R"({"status":0,"access_key":"tr-key-2"})"},
      {true, 200, R"({"status":0,"access_token":"tr-token-2"})"},
      {true, 200, tr3200Response()},
  };
  manager = create(transaction);
  AllNewMTSRestTransactionSchema schema{
      "TR3200Q1",
      "InRec1",
      "OutRec1",
      kTr3200Input,
      sizeof(kTr3200Input) / sizeof(kTr3200Input[0]),
      kTr3200Output,
      kTr3200OutputCount,
      1,
  };
  const std::string market = "01";
  const AllNewMTSRestTransactionInput input{
      "OVRS_MKT_COD",
      reinterpret_cast<const uint8_t *>(market.data()),
      market.size(),
  };
  std::vector<std::vector<char>> output_storage;
  auto outputs = tr3200Outputs(output_storage);
  assert(kTr3200OutputCount == 62);
  assert(allnewmts_rest_transaction_call(
             manager, &schema, &input, 1, "HS7001S03", outputs.data(),
             outputs.size()) == ALLNEWMTS_REST_AUTH_OK);
  assert(transaction.records.size() == 6);
  assertRequest(transaction.records[0], "/clientAuth", 15000);
  assertRequest(transaction.records[1], "/clientAccessToken", 15000,
                "tr-key-1");
  assertTransactionRequest(transaction.records[2], "tr-token-1");
  assertRequest(transaction.records[3], "/clientAuth", 15000);
  assertRequest(transaction.records[4], "/clientAccessToken", 15000,
                "tr-key-2");
  assertTransactionRequest(transaction.records[5], "tr-token-2");
  for (const auto &output : outputs)
    assert(output.present == 1 && output.value_size > 0);
  assert(std::string(outputs[0].value) == "01");
  assert(std::string(outputs[1].value) == "미국시장");

  transaction.replies.push_back(
      {true, 200,
       R"({"status":0,"resultCode":"E0000002","outputData":{"outRec1":{"OVRS_MKT_COD":"01"}}})"});
  assert(allnewmts_rest_transaction_call(
             manager, &schema, &input, 1, "HS7001S03", outputs.data(),
             outputs.size()) == ALLNEWMTS_REST_AUTH_REJECTED);
  for (const auto &output : outputs)
    assert(output.present == 0 && output.value_size == 0 &&
           output.value[0] == '\0');

  transaction.replies.push_back(
      {true, 200,
       R"({"status":0,"resultCode":"00000000","outputData":{"other":{}}})"});
  assert(allnewmts_rest_transaction_call(
             manager, &schema, &input, 1, "HS7001S03", outputs.data(),
             outputs.size()) == ALLNEWMTS_REST_AUTH_RESPONSE_INVALID);

  transaction.replies.push_back(
      {true, 200,
       R"({"status":0,"resultCode":"00000000","outputData":{"outRec1":{"OVRS_MKT_COD":"123"}}})"});
  assert(allnewmts_rest_transaction_call(
             manager, &schema, &input, 1, "HS7001S03", outputs.data(),
             outputs.size()) == ALLNEWMTS_REST_AUTH_RESPONSE_INVALID);

  const size_t before_invalid = transaction.records.size();
  const std::string over_width_market = "010";
  const AllNewMTSRestTransactionInput invalid_input{
      "OVRS_MKT_COD",
      reinterpret_cast<const uint8_t *>(over_width_market.data()),
      over_width_market.size(),
  };
  assert(allnewmts_rest_transaction_call(
             manager, &schema, &invalid_input, 1, "HS7001S03",
             outputs.data(), outputs.size()) ==
         ALLNEWMTS_REST_AUTH_INVALID_ARGUMENT);
  assert(transaction.records.size() == before_invalid);

  transaction.replies.push_back({true, 401, ""});
  transaction.replies.push_back(
      {true, 200, R"({"status":0,"access_key":"tr-key-3"})"});
  transaction.replies.push_back(
      {true, 200, R"({"status":0,"access_token":"tr-token-3"})"});
  schema.read_only = 0;
  const size_t before_non_read_only = transaction.records.size();
  assert(allnewmts_rest_transaction_call(
             manager, &schema, &input, 1, "HS7001S03", outputs.data(),
             outputs.size()) == ALLNEWMTS_REST_AUTH_HTTP_ERROR);
  assert(transaction.records.size() == before_non_read_only + 3);
  assertTransactionRequest(transaction.records[before_non_read_only],
                           "tr-token-2");
  assertRequest(transaction.records[before_non_read_only + 1], "/clientAuth",
                15000);
  assertRequest(transaction.records[before_non_read_only + 2],
                "/clientAccessToken", 15000, "tr-key-3");
  assert(allnewmts_rest_auth_snapshot(manager, &credentials) ==
         ALLNEWMTS_REST_AUTH_OK);
  assert(credentials.generation == 3);
  allnewmts_rest_auth_destroy(manager);

  const AllNewMTSRestAuthTransport transport{post, now};
  assert(allnewmts_rest_auth_create("CC320", "bad client", "synthetic-auth",
                                    "NEWMTS", &transport, &fake, &manager) ==
         ALLNEWMTS_REST_AUTH_INVALID_ARGUMENT);

  std::cout << "PASS REST AccessKey/AccessToken issuance and descriptor-driven "
               "TR3200Q1 transaction flow\n";
}
