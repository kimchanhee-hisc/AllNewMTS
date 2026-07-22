import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const markerPrefix = 'ALLNEWMTS_G004_UI_READY=';
const bundleId = 'com.anonymous.allnewmts';
const maximumSelectionAttempts = 3;
const portReleaseTimeoutMs = 1000;
const truthProbeTimeoutMs = 5000;
const allowedArguments = new Set(['', '--preflight', '--network-regression', '--pod-cache-regression', '--metro-evidence-regression', '--build-failure-marker-transport-child', '--generic-failure-marker-transport-child', '--nested-swiftpm-regression']);
const requestedMode = process.argv.slice(2).join(' ');
assert.ok(allowedArguments.has(requestedMode), 'usage: node scripts/run-g004-development-build.mjs [--preflight|--network-regression|--pod-cache-regression|--metro-evidence-regression|--build-failure-marker-transport-child|--generic-failure-marker-transport-child|--nested-swiftpm-regression]');

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const unrefDelay = (milliseconds, value = undefined) => new Promise((resolve) => { const timer = setTimeout(resolve, milliseconds, value); timer.unref(); });
const exists = (file) => fs.existsSync(path.join(root, file));
const commandPath = (name) => {
  const result = spawnSync('/usr/bin/which', [name], { encoding: 'utf8' });
  assert.equal(result.status, 0, `TOOLCHAIN_BLOCKED: ${name} is unavailable`);
  return result.stdout.trim();
};
const run = (file, args, options = {}) => {
  const result = spawnSync(file, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024,
    ...options
  });
  assert.equal(result.error, undefined, `${file} could not start: ${result.error?.message}`);
  const diagnostic = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  assert.equal(result.status, 0, `${file} ${args.join(' ')} failed:\n${diagnostic.slice(-20000)}`);
  return result.stdout ?? '';
};

const nofollowHelperSource = String.raw`import base64, errno, hashlib, json, os, secrets, signal, socket, stat, subprocess, sys, time, traceback

VERSION = "allnewmts-nofollow-v1"
ROOTS = [
  [".DerivedData"], [".build"], [".swiftpm"], [".generated"],
  ["Products", "ExpoModulesJSI.xcframework"]
]
O_DIRECTORY = os.O_DIRECTORY
O_NOFOLLOW = os.O_NOFOLLOW
ROLE = os.environ.pop("ALLNEWMTS_ROLE", "custodian")
repo_fd = int(os.environ.pop("ALLNEWMTS_REPO_FD", "-1"))
omx_fd = int(os.environ.pop("ALLNEWMTS_OMX_FD", "-1"))
tmp_fd = int(os.environ.pop("ALLNEWMTS_TMP_FD", "-1"))
runner_fd = int(os.environ.pop("ALLNEWMTS_RUNNER_FD", "-1"))
runner_name = os.environ.pop("ALLNEWMTS_RUNNER_NAME", "")
physical_cwd = os.environ.pop("ALLNEWMTS_PHYSICAL_CWD", "")
created_omx = os.environ.pop("ALLNEWMTS_CREATED_OMX", "0") == "1"
created_tmp = os.environ.pop("ALLNEWMTS_CREATED_TMP", "0") == "1"
baseline = None
test_hook = None
artifacts = {}

class PrimarySentinel(RuntimeError): pass

def require_capabilities():
  required = ["O_NOFOLLOW", "O_DIRECTORY", "open", "stat", "readlink", "mkdir", "symlink", "unlink", "rmdir", "rename", "fstat", "fchmod", "listdir", "read", "write", "fsync", "close"]
  for name in required:
    if not hasattr(os, name): raise RuntimeError("NOFOLLOW_CAPABILITY_MISSING:" + name)
  if os.open not in os.supports_dir_fd or os.stat not in os.supports_dir_fd or os.stat not in os.supports_follow_symlinks: raise RuntimeError("NOFOLLOW_DESCRIPTOR_API_MISSING")
  for fn in [os.readlink, os.mkdir, os.symlink, os.unlink, os.rmdir, os.rename]:
    if fn not in os.supports_dir_fd: raise RuntimeError("NOFOLLOW_DIR_FD_MISSING:" + fn.__name__)

def component(value):
  if not isinstance(value, str): raise ValueError("component type")
  value.encode("utf-8", "strict")
  if not value or value in (".", "..") or "/" in value or "\x00" in value: raise ValueError("invalid component")
  return value

def same(a, b):
  return stat.S_IFMT(a.st_mode) == stat.S_IFMT(b.st_mode) and (a.st_dev, a.st_ino) == (b.st_dev, b.st_ino)

def recheck_chain(chain):
  for parent_fd, name, child_fd in chain:
    parent_record = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    child_record = os.fstat(child_fd)
    if not stat.S_ISDIR(parent_record.st_mode) or not same(parent_record, child_record): raise RuntimeError("ancestor identity changed")

def fire_hook(stage, **context):
  if test_hook is not None: test_hook(stage, context)

def open_dir(parent_fd, name):
  name = component(name)
  before = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
  if not stat.S_ISDIR(before.st_mode): raise RuntimeError("directory required")
  fd = os.open(name, os.O_RDONLY | O_DIRECTORY | O_NOFOLLOW, dir_fd=parent_fd)
  after = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
  current = os.fstat(fd)
  if not same(before, current) or not same(after, current): os.close(fd); raise RuntimeError("directory identity changed")
  return fd

def open_chain(start_fd, parts):
  fd = os.dup(start_fd)
  try:
    for part in parts:
      child = open_dir(fd, part)
      os.close(fd)
      fd = child
    return fd
  except:
    os.close(fd)
    raise

def mkdir_chain(start_fd, parts):
  fd = os.dup(start_fd)
  try:
    for raw in parts:
      name = component(raw)
      try: child = open_dir(fd, name)
      except FileNotFoundError:
        os.mkdir(name, 0o700, dir_fd=fd)
        child = open_dir(fd, name)
      os.close(fd)
      fd = child
    return fd
  except:
    os.close(fd)
    raise

def open_chain_bound(start_fd, parts, base_chain=[]):
  parent = start_fd
  opened = []
  try:
    for raw in parts:
      name = component(raw)
      child = open_dir(parent, name)
      fire_hook("open-chain-after-directory-open", parent_fd=parent, name=name, child_fd=child)
      opened.append((parent, name, child))
      parent = child
    chain = list(base_chain) + opened
    recheck_chain(chain)
    return parent, chain, opened
  except:
    for _, _, child in reversed(opened): os.close(child)
    raise

def mkdir_chain_bound(start_fd, parts, base_chain=[]):
  parent = start_fd
  opened = []
  try:
    for raw in parts:
      name = component(raw)
      recheck_chain(list(base_chain) + opened)
      try: child = open_dir(parent, name)
      except FileNotFoundError:
        os.mkdir(name, 0o700, dir_fd=parent)
        child = open_dir(parent, name)
      opened.append((parent, name, child))
      parent = child
    chain = list(base_chain) + opened
    recheck_chain(chain)
    return parent, chain, opened
  except:
    for _, _, child in reversed(opened): os.close(child)
    raise

def close_opened(opened):
  for _, _, child in reversed(opened): os.close(child)

def relhex(parts): return "/".join(parts).encode("utf-8").hex()
def mode(st): return format(st.st_mode & 0o7777, "04o")
def line(obj): return json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n"

def check_link(parts, target):
  target.encode("utf-8", "strict")
  if target.startswith("/"): raise RuntimeError("absolute symlink target")
  resolved = list(parts[:-1])
  for raw in target.split("/"):
    if raw in ("", "."): continue
    if raw == "..":
      if not resolved: raise RuntimeError("escaping symlink target")
      resolved.pop()
    else: resolved.append(component(raw))

def inventory_dir(fd, parts, seen, chain=[]):
  recheck_chain(chain)
  st_root = os.fstat(fd)
  records = [line({"version":VERSION,"type":"directory","pathUtf8Hex":relhex(parts),"mode":mode(st_root)})]
  names = sorted(os.listdir(fd), key=lambda value: value.encode("utf-8", "strict"))
  for name in names:
    recheck_chain(chain)
    component(name)
    st1 = os.stat(name, dir_fd=fd, follow_symlinks=False)
    child_parts = parts + [name]
    if stat.S_ISDIR(st1.st_mode):
      child = open_dir(fd, name)
      fire_hook("inventory-after-directory-open", parent_fd=fd, name=name, child_fd=child)
      try: records.extend(inventory_dir(child, child_parts, seen, chain + [(fd, name, child)]))
      finally: os.close(child)
    elif stat.S_ISREG(st1.st_mode):
      if st1.st_nlink != 1 or (st1.st_dev, st1.st_ino) in seen: raise RuntimeError("duplicate inode or hard link")
      seen.add((st1.st_dev, st1.st_ino))
      fire_hook("inventory-before-file-open", parent_fd=fd, name=name, stat=st1)
      recheck_chain(chain)
      file_fd = os.open(name, os.O_RDONLY | O_NOFOLLOW, dir_fd=fd)
      try:
        recheck_chain(chain)
        fst = os.fstat(file_fd)
        if not same(st1, fst) or fst.st_mode != st1.st_mode or fst.st_size != st1.st_size or fst.st_nlink != 1: raise RuntimeError("file identity changed")
        data = b""
        while len(data) < fst.st_size:
          chunk = os.read(file_fd, fst.st_size - len(data))
          if not chunk: raise RuntimeError("short read")
          data += chunk
        if os.read(file_fd, 1) != b"": raise RuntimeError("long read")
      finally: os.close(file_fd)
      st2 = os.stat(name, dir_fd=fd, follow_symlinks=False)
      recheck_chain(chain)
      if not same(st1, st2) or st2.st_mode != st1.st_mode or st2.st_size != st1.st_size or st2.st_nlink != 1: raise RuntimeError("file changed after read")
      records.append(line({"version":VERSION,"type":"file","pathUtf8Hex":relhex(child_parts),"mode":mode(st1),"size":str(len(data)),"sha256":hashlib.sha256(data).hexdigest()}))
    elif stat.S_ISLNK(st1.st_mode):
      target = os.readlink(name.encode("utf-8"), dir_fd=fd)
      if isinstance(target, bytes): target_bytes = target; target = target.decode("utf-8", "strict")
      else: target_bytes = target.encode("utf-8", "strict")
      check_link(child_parts, target)
      records.append(line({"version":VERSION,"type":"symlink","pathUtf8Hex":relhex(child_parts),"mode":mode(st1),"targetUtf8Hex":target_bytes.hex(),"targetSha256":hashlib.sha256(target_bytes).hexdigest()}))
    else: raise RuntimeError("special file rejected")
  recheck_chain(chain)
  return records

def inventory_root(parent_fd, parts):
  parent = open_chain(parent_fd, parts[:-1]) if len(parts) > 1 else os.dup(parent_fd)
  try:
    try: st = os.stat(parts[-1], dir_fd=parent, follow_symlinks=False)
    except FileNotFoundError:
      records = [line({"version":VERSION,"type":"absent","pathUtf8Hex":""})]
    else:
      if not stat.S_ISDIR(st.st_mode): raise RuntimeError("declared root is not directory")
      child = open_dir(parent, parts[-1])
      try: records = inventory_dir(child, [], set(), [(parent, parts[-1], child)])
      finally: os.close(child)
    stream = "".join(records).encode("utf-8")
    return {"streamBase64":base64.b64encode(stream).decode(),"sha256":hashlib.sha256(stream).hexdigest()}
  finally: os.close(parent)

def inventory_root_bound(parent_fd, parts, base_chain):
  opened = []
  try: parent, chain, opened = open_chain_bound(parent_fd, parts[:-1], base_chain)
  except FileNotFoundError:
    stream = line({"version":VERSION,"type":"absent","pathUtf8Hex":""}).encode("utf-8")
    return {"streamBase64":base64.b64encode(stream).decode(),"sha256":hashlib.sha256(stream).hexdigest()}
  try:
    recheck_chain(chain)
    try: st = os.stat(parts[-1], dir_fd=parent, follow_symlinks=False)
    except FileNotFoundError: records = [line({"version":VERSION,"type":"absent","pathUtf8Hex":""})]
    else:
      if not stat.S_ISDIR(st.st_mode): raise RuntimeError("declared root is not directory")
      child = open_dir(parent, parts[-1])
      binding = chain + [(parent, parts[-1], child)]
      try: records = inventory_dir(child, [], set(), binding)
      finally: os.close(child)
    recheck_chain(chain)
    stream = "".join(records).encode("utf-8")
    return {"streamBase64":base64.b64encode(stream).decode(),"sha256":hashlib.sha256(stream).hexdigest()}
  finally: close_opened(opened)

def copy_file(src_fd, dst_fd, name, st, src_chain, dst_chain):
  recheck_chain(src_chain); recheck_chain(dst_chain); fire_hook("copy-before-file-open", src_fd=src_fd, dst_fd=dst_fd, name=name, stat=st); recheck_chain(src_chain); recheck_chain(dst_chain)
  source = os.open(name, os.O_RDONLY | O_NOFOLLOW, dir_fd=src_fd)
  target = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | O_NOFOLLOW, st.st_mode & 0o7777, dir_fd=dst_fd)
  try:
    recheck_chain(src_chain); recheck_chain(dst_chain)
    remaining = st.st_size
    while remaining:
      data = os.read(source, min(65536, remaining))
      if not data: raise RuntimeError("copy short read")
      view = memoryview(data)
      while view:
        recheck_chain(src_chain); recheck_chain(dst_chain)
        written = os.write(target, view)
        if written <= 0: raise RuntimeError("copy no progress")
        view = view[written:]
      remaining -= len(data)
    if os.read(source, 1): raise RuntimeError("copy long read")
    current = os.stat(name,dir_fd=src_fd,follow_symlinks=False)
    if not same(st,current) or current.st_mode != st.st_mode or current.st_size != st.st_size or current.st_nlink != 1: raise RuntimeError("copy source changed")
    recheck_chain(src_chain); recheck_chain(dst_chain)
    os.fsync(target); os.fchmod(target, st.st_mode & 0o7777)
  finally: os.close(source); os.close(target)

def copy_named(src_fd, src_name, dst_fd, dst_name, src_chain, dst_chain):
  recheck_chain(src_chain); recheck_chain(dst_chain)
  st = os.stat(component(src_name), dir_fd=src_fd, follow_symlinks=False)
  if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1: raise RuntimeError("regular unique source required")
  source = os.open(src_name, os.O_RDONLY | O_NOFOLLOW, dir_fd=src_fd)
  target = os.open(component(dst_name), os.O_WRONLY | os.O_CREAT | os.O_EXCL | O_NOFOLLOW, st.st_mode & 0o7777, dir_fd=dst_fd)
  try:
    if not same(st, os.fstat(source)): raise RuntimeError("copy source identity changed")
    remaining = st.st_size
    while remaining:
      recheck_chain(src_chain); recheck_chain(dst_chain)
      data = os.read(source, min(65536, remaining))
      if not data: raise RuntimeError("copy short read")
      view = memoryview(data)
      while view:
        count = os.write(target, view)
        if count <= 0: raise RuntimeError("copy no progress")
        view = view[count:]
      remaining -= len(data)
    if os.read(source, 1): raise RuntimeError("copy long read")
    current = os.stat(src_name,dir_fd=src_fd,follow_symlinks=False)
    if not same(st,current) or current.st_mode != st.st_mode or current.st_size != st.st_size or current.st_nlink != 1: raise RuntimeError("copy source changed")
    os.fsync(target); os.fchmod(target, st.st_mode & 0o7777)
    recheck_chain(src_chain); recheck_chain(dst_chain)
  finally: os.close(source); os.close(target)

def read_unique_file(parent_fd, name, chain):
  recheck_chain(chain)
  st = os.stat(component(name), dir_fd=parent_fd, follow_symlinks=False)
  if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1: raise RuntimeError("regular unique source required")
  fd = os.open(name, os.O_RDONLY | O_NOFOLLOW, dir_fd=parent_fd)
  try:
    if not same(st, os.fstat(fd)): raise RuntimeError("read source identity changed")
    data = b""
    while len(data) < st.st_size:
      chunk = os.read(fd, st.st_size-len(data))
      if not chunk: raise RuntimeError("short read")
      data += chunk
    if os.read(fd,1): raise RuntimeError("long read")
  finally: os.close(fd)
  recheck_chain(chain)
  current=os.stat(name,dir_fd=parent_fd,follow_symlinks=False)
  if not same(st,current) or current.st_mode != st.st_mode or current.st_size != st.st_size or current.st_nlink != 1: raise RuntimeError("read source changed")
  return data

def copy_tree(src_fd, dst_fd, src_chain=[], dst_chain=[], parts=[]):
  recheck_chain(src_chain); recheck_chain(dst_chain)
  directories = []
  for name in sorted(os.listdir(src_fd), key=lambda value: value.encode("utf-8", "strict")):
    recheck_chain(src_chain); recheck_chain(dst_chain)
    st = os.stat(name, dir_fd=src_fd, follow_symlinks=False)
    if stat.S_ISDIR(st.st_mode):
      os.mkdir(name, 0o700, dir_fd=dst_fd)
      source = open_dir(src_fd, name); target = open_dir(dst_fd, name)
      fire_hook("copy-after-directory-open", src_fd=src_fd, dst_fd=dst_fd, name=name, source_fd=source, target_fd=target)
      try: copy_tree(source, target, src_chain+[(src_fd,name,source)], dst_chain+[(dst_fd,name,target)], parts+[name]); os.fchmod(target, st.st_mode & 0o7777)
      finally: os.close(source); os.close(target)
    elif stat.S_ISREG(st.st_mode):
      if st.st_nlink != 1: raise RuntimeError("hard link rejected")
      copy_file(src_fd, dst_fd, name, st, src_chain, dst_chain)
    elif stat.S_ISLNK(st.st_mode):
      target = os.readlink(name, dir_fd=src_fd); check_link(parts+[name], target)
      os.symlink(target, name, dir_fd=dst_fd)
    else: raise RuntimeError("special file rejected")
  recheck_chain(src_chain); recheck_chain(dst_chain)

def delete_tree(fd, chain=[]):
  recheck_chain(chain)
  for name in sorted(os.listdir(fd), key=lambda value: value.encode("utf-8", "strict"), reverse=True):
    recheck_chain(chain)
    st = os.stat(name, dir_fd=fd, follow_symlinks=False)
    if stat.S_ISDIR(st.st_mode):
      child = open_dir(fd, name)
      try: delete_tree(child, chain+[(fd,name,child)])
      finally: os.close(child)
      current = os.stat(name, dir_fd=fd, follow_symlinks=False)
      if not same(st, current): raise RuntimeError("directory changed before delete")
      os.rmdir(name, dir_fd=fd)
    elif stat.S_ISREG(st.st_mode) or stat.S_ISLNK(st.st_mode):
      current = os.stat(name, dir_fd=fd, follow_symlinks=False)
      if not same(st, current): raise RuntimeError("entry changed before delete")
      os.unlink(name, dir_fd=fd)
    else: raise RuntimeError("special file blocks delete")
  recheck_chain(chain)

def remove_at(parent_fd, parts, root_chain=[]):
  parent = open_chain(parent_fd, parts[:-1]) if len(parts) > 1 else os.dup(parent_fd)
  try:
    try: st = os.stat(parts[-1], dir_fd=parent, follow_symlinks=False)
    except FileNotFoundError: return
    if stat.S_ISDIR(st.st_mode):
      child = open_dir(parent, parts[-1])
      fire_hook("delete-after-root-open", parent_fd=parent, name=parts[-1], child_fd=child)
      try: delete_tree(child, root_chain+[(parent,parts[-1],child)])
      finally: os.close(child)
      os.rmdir(parts[-1], dir_fd=parent)
    else: os.unlink(parts[-1], dir_fd=parent)
  finally: os.close(parent)

def remove_at_bound(parent_fd, parts, base_chain):
  opened = []
  try: parent, chain, opened = open_chain_bound(parent_fd, parts[:-1], base_chain)
  except FileNotFoundError: return
  try:
    recheck_chain(chain)
    try: st = os.stat(parts[-1], dir_fd=parent, follow_symlinks=False)
    except FileNotFoundError: return
    if stat.S_ISDIR(st.st_mode):
      child = open_dir(parent, parts[-1])
      binding = chain + [(parent, parts[-1], child)]
      fire_hook("delete-after-root-open", parent_fd=parent, name=parts[-1], child_fd=child)
      try: delete_tree(child, binding)
      finally: os.close(child)
      recheck_chain(chain)
      if not same(st, os.stat(parts[-1],dir_fd=parent,follow_symlinks=False)): raise RuntimeError("root changed before delete")
      os.rmdir(parts[-1], dir_fd=parent)
    else:
      if not same(st, os.stat(parts[-1],dir_fd=parent,follow_symlinks=False)): raise RuntimeError("entry changed before delete")
      os.unlink(parts[-1], dir_fd=parent)
    recheck_chain(chain)
  finally: close_opened(opened)

def backup_package():
  global baseline
  package, package_chain, package_opened = open_chain_bound(repo_fd, ["node_modules","expo-modules-jsi","apple"])
  backup_parent, backup_chain, backup_opened = mkdir_chain_bound(runner_fd, ["backup"], [(tmp_fd,runner_name,runner_fd)])
  try:
    recheck_chain(package_chain); recheck_chain(backup_chain)
    baseline = {"roots":[],"whole":inventory_dir(package, [], set(), package_chain)}
    for index, parts in enumerate(ROOTS):
      recheck_chain(package_chain); recheck_chain(backup_chain)
      inv = inventory_root_bound(package, parts, package_chain); baseline["roots"].append(inv)
      source_opened = []
      try:
        source_parent, source_chain, source_opened = open_chain_bound(package, parts[:-1], package_chain)
        st = os.stat(parts[-1], dir_fd=source_parent, follow_symlinks=False)
      except FileNotFoundError:
        close_opened(source_opened)
        continue
      os.mkdir(str(index), 0o700, dir_fd=backup_parent)
      destination = open_dir(backup_parent, str(index)); source = open_dir(source_parent, parts[-1])
      source_binding = source_chain + [(source_parent,parts[-1],source)]
      destination_binding = backup_chain + [(backup_parent,str(index),destination)]
      raw = base64.b64decode(inv["streamBase64"])
      try: copy_tree(source, destination, source_binding, destination_binding); os.fchmod(destination, int(json.loads(raw.splitlines()[0])["mode"],8)); recheck_chain(source_binding); recheck_chain(destination_binding)
      finally: os.close(source); os.close(destination); close_opened(source_opened)
      if inventory_root_bound(backup_parent, [str(index)], backup_chain) != inv: raise RuntimeError("backup inventory mismatch")
    whole_bytes="".join(baseline["whole"]).encode()
    return {"rootStreams":[item["streamBase64"] for item in baseline["roots"]],"rootAggregates":[item["sha256"] for item in baseline["roots"]],"wholeStreamBase64":base64.b64encode(whole_bytes).decode(),"wholeSha256":hashlib.sha256(whole_bytes).hexdigest()}
  finally: close_opened(backup_opened); close_opened(package_opened)

def restore_roots(package, package_chain, backup_parent, backup_chain, roots, root_baselines, injected=[]):
  failures = []
  for index, parts in enumerate(roots):
    try:
      recheck_chain(package_chain); recheck_chain(backup_chain)
      root_name="/".join(parts)
      if root_name in injected: raise RuntimeError("RESTORE_FAILURE:"+root_name)
      remove_at_bound(package, parts, package_chain)
      original = root_baselines[index]
      raw = base64.b64decode(original["streamBase64"])
      if b'"type":"absent"' not in raw:
        parent, parent_chain, parent_opened = mkdir_chain_bound(package, parts[:-1], package_chain)
        os.mkdir(parts[-1], 0o700, dir_fd=parent)
        destination = open_dir(parent, parts[-1]); source = open_dir(backup_parent, str(index))
        destination_binding = parent_chain + [(parent,parts[-1],destination)]
        source_binding = backup_chain + [(backup_parent,str(index),source)]
        try: copy_tree(source, destination, source_binding, destination_binding); os.fchmod(destination, int(json.loads(raw.splitlines()[0])["mode"],8)); recheck_chain(source_binding); recheck_chain(destination_binding)
        finally: os.close(source); os.close(destination); close_opened(parent_opened)
      if inventory_root_bound(package, parts, package_chain) != original: raise RuntimeError("root restoration mismatch")
      recheck_chain(package_chain); recheck_chain(backup_chain)
    except Exception as error: failures.append({"root":"/".join(parts),"message":str(error)})
  return failures

def restore_package():
  if baseline is None: return {"restored":False}
  package, package_chain, package_opened = open_chain_bound(repo_fd, ["node_modules","expo-modules-jsi","apple"])
  backup_parent, backup_chain, backup_opened = open_chain_bound(runner_fd, ["backup"], [(tmp_fd,runner_name,runner_fd)])
  try:
    failures = restore_roots(package, package_chain, backup_parent, backup_chain, ROOTS, baseline["roots"])
    whole = "".join(inventory_dir(package, [], set(), package_chain)).encode()
    expected = "".join(baseline["whole"]).encode()
    if whole != expected: failures.append({"root":"<whole-package>","message":"whole package restoration mismatch"})
    return {"restored":not failures,"failures":failures,"rootStreams":[item["streamBase64"] for item in baseline["roots"]],"rootAggregates":[item["sha256"] for item in baseline["roots"]],"wholeStreamBase64":base64.b64encode(whole).decode(),"wholeSha256":hashlib.sha256(whole).hexdigest()}
  finally: close_opened(backup_opened); close_opened(package_opened)

def promote_swiftpm():
  runner_chain = []
  package=os.dup(package_fd); package_chain=[]; package_opened=[]
  staged, staged_chain, staged_opened = open_chain_bound(runner_fd,["staged"],runner_chain)
  release_handles = []
  try:
    recheck_chain(package_chain); recheck_chain(staged_chain)
    expected_modules = []
    headers = []
    for arch in ["arm64","x86_64"]:
      release, release_chain, release_opened = open_chain_bound(runner_fd,[arch,"scratch",arch+"-apple-ios-simulator","release"],runner_chain)
      modules, modules_chain, modules_opened = open_chain_bound(release,["Modules"],release_chain)
      includes, includes_chain, includes_opened = open_chain_bound(release,["ExpoModulesJSI.build","include"],release_chain)
      release_handles.append((release_opened,modules_opened,includes_opened))
      headers.append(read_unique_file(includes,"ExpoModulesJSI-Swift.h",includes_chain))
      for extension in ["abi.json","swiftdoc","swiftinterface","swiftmodule","swiftsourceinfo"]:
        name="ExpoModulesJSI."+extension
        read_unique_file(modules,name,modules_chain)
        expected_modules.append((arch,extension,modules,modules_chain))
    if headers[0] != headers[1]: raise RuntimeError("generated headers differ")
    remove_at_bound(package,[".DerivedData","Build","Intermediates.noindex","GeneratedModuleMaps-iphonesimulator"],package_chain)
    framework, framework_chain, framework_opened = mkdir_chain_bound(package,[".DerivedData","Build","Products","Release-iphonesimulator","PackageFrameworks","ExpoModulesJSI.framework"],package_chain)
    modules_destination, modules_destination_chain, modules_destination_opened = mkdir_chain_bound(package,[".DerivedData","Build","Products","Release-iphonesimulator","ExpoModulesJSI.swiftmodule"],package_chain)
    maps, maps_chain, maps_opened = mkdir_chain_bound(package,[".DerivedData","Build","Intermediates.noindex","GeneratedModuleMaps-iphonesimulator"],package_chain)
    try:
      copy_named(staged,"ExpoModulesJSI",framework,"ExpoModulesJSI",staged_chain,framework_chain)
      for arch,extension,source,source_chain in expected_modules:
        copy_named(source,"ExpoModulesJSI."+extension,modules_destination,arch+"-apple-ios-simulator."+extension,source_chain,modules_destination_chain)
      header_source, header_source_chain, header_source_opened = open_chain_bound(runner_fd,["arm64","scratch","arm64-apple-ios-simulator","release","ExpoModulesJSI.build","include"],runner_chain)
      try: copy_named(header_source,"ExpoModulesJSI-Swift.h",maps,"ExpoModulesJSI-Swift.h",header_source_chain,maps_chain)
      finally: close_opened(header_source_opened)
      products, products_chain, products_opened = open_chain_bound(package,[".DerivedData","Build","Products","Release-iphonesimulator"],package_chain)
      dsym_source = open_dir(staged,"ExpoModulesJSI.framework.dSYM")
      os.mkdir("ExpoModulesJSI.framework.dSYM",0o700,dir_fd=products); dsym_destination=open_dir(products,"ExpoModulesJSI.framework.dSYM")
      try: copy_tree(dsym_source,dsym_destination,staged_chain+[(staged,"ExpoModulesJSI.framework.dSYM",dsym_source)],products_chain+[(products,"ExpoModulesJSI.framework.dSYM",dsym_destination)]); os.fchmod(dsym_destination,os.fstat(dsym_source).st_mode & 0o7777)
      finally: os.close(dsym_source); os.close(dsym_destination); close_opened(products_opened)
      if sorted(os.listdir(framework),key=lambda value:value.encode()) != ["ExpoModulesJSI"]: raise RuntimeError("framework staging shape mismatch")
      expected_names=sorted([arch+"-apple-ios-simulator."+extension for arch in ["arm64","x86_64"] for extension in ["abi.json","swiftdoc","swiftinterface","swiftmodule","swiftsourceinfo"]],key=lambda value:value.encode())
      if sorted(os.listdir(modules_destination),key=lambda value:value.encode()) != expected_names: raise RuntimeError("module staging shape mismatch")
      if sorted(os.listdir(maps),key=lambda value:value.encode()) != ["ExpoModulesJSI-Swift.h"]: raise RuntimeError("header staging shape mismatch")
      derived = inventory_root_bound(package,[".DerivedData"],package_chain)
      staged_inventory = inventory_root_bound(runner_fd,["staged"],runner_chain)
      return {"derivedAggregate":derived["sha256"],"stagedAggregate":staged_inventory["sha256"],"moduleFiles":len(expected_names),"headerFiles":len(os.listdir(maps))}
    finally:
      close_opened(maps_opened); close_opened(modules_destination_opened); close_opened(framework_opened)
  finally:
    for release_opened,modules_opened,includes_opened in reversed(release_handles): close_opened(includes_opened); close_opened(modules_opened); close_opened(release_opened)
    close_opened(staged_opened); close_opened(package_opened)

def package_inventory():
  package, package_chain, package_opened=open_chain_bound(repo_fd,["node_modules","expo-modules-jsi","apple"])
  try:
    roots=[inventory_root_bound(package,parts,package_chain) for parts in ROOTS]; whole="".join(inventory_dir(package,[],set(),package_chain)).encode()
    return {"rootStreams":[item["streamBase64"] for item in roots],"rootAggregates":[item["sha256"] for item in roots],"wholeStreamBase64":base64.b64encode(whole).decode(),"wholeSha256":hashlib.sha256(whole).hexdigest()}
  finally: close_opened(package_opened)

def regression():
  global test_hook
  cases = ["absent-roots","present-roots","absolute-symlink","escaping-symlink","fifo-socket","duplicate-inode","final-substitution","ancestor-substitution","escaped-writes","mode-byte-drift","primary-restore-order","residue-free","var-alias-exclusion"]
  fixture_root = os.dup(runner_fd)
  fixture=None; fixture_name=None; outside=None; outside_before=None; outside_inventory=None; outside_reference=None; present_before=None
  results = {}
  try:
    def outside_oracle():
      current=os.stat("outside",dir_fd=fixture,follow_symlinks=False); fd=os.open("outside",os.O_RDONLY|O_NOFOLLOW,dir_fd=fixture); data=os.read(fd,len(outside)+1); os.close(fd)
      return {"dev":str(current.st_dev),"ino":str(current.st_ino),"mode":mode(current),"sha256":hashlib.sha256(data).hexdigest(),"directory":inventory_root(fixture,["outside-dir"])["sha256"]}
    def case_oracle():
      root_stream="".join(inventory_dir(fixture,[],set())).encode(); whole=root_stream; outside_value=outside_oracle()
      root={"streamBase64":base64.b64encode(root_stream).decode(),"sha256":hashlib.sha256(root_stream).hexdigest()}
      return {"outside":outside_value,"residue":sorted(os.listdir(fixture),key=lambda value:value.encode()),"root":{"streamBase64":root["streamBase64"],"sha256":root["sha256"]},"whole":{"streamBase64":base64.b64encode(whole).decode(),"sha256":hashlib.sha256(whole).hexdigest()}}
    def begin_case(name, with_present=False):
      nonlocal fixture,fixture_name,outside,outside_before,outside_inventory,outside_reference,present_before
      fixture_name="case-"+name; os.mkdir(fixture_name,0o700,dir_fd=fixture_root); fixture=open_dir(fixture_root,fixture_name)
      outside=b"outside-sentinel\n"; file_fd=os.open("outside",os.O_WRONLY|os.O_CREAT|os.O_EXCL|O_NOFOLLOW,0o640,dir_fd=fixture); write_all(file_fd,outside); os.fsync(file_fd); os.close(file_fd)
      os.mkdir("outside-dir",0o700,dir_fd=fixture); outside_dir=open_dir(fixture,"outside-dir"); outside_file=os.open("sentinel",os.O_WRONLY|os.O_CREAT|os.O_EXCL|O_NOFOLLOW,0o600,dir_fd=outside_dir); write_all(outside_file,b"outside-directory\n"); os.close(outside_file); os.close(outside_dir)
      outside_before=os.stat("outside",dir_fd=fixture,follow_symlinks=False); outside_inventory=inventory_root(fixture,["outside-dir"]); outside_reference=outside_oracle(); present_before=None
      if with_present:
        os.mkdir("present",0o750,dir_fd=fixture); present=open_dir(fixture,"present"); os.mkdir("nested",0o700,dir_fd=present); nested=open_dir(present,"nested"); f=os.open("file",os.O_WRONLY|os.O_CREAT|os.O_EXCL|O_NOFOLLOW,0o640,dir_fd=nested); write_all(f,b"bytes"); os.close(f); os.symlink("nested/file","link",dir_fd=present); os.close(nested); os.close(present); present_before=inventory_root(fixture,["present"])
      return case_oracle()
    def passed(name, oracle_before, **evidence):
      nonlocal fixture,fixture_name
      after=case_oracle(); assert after==oracle_before and after["outside"]==outside_reference; results[name]={"passed":after==oracle_before,"fixture":fixture_name,"oracle":{"before":oracle_before,"after":after},**evidence}
      delete_tree(fixture); os.close(fixture); os.rmdir(fixture_name,dir_fd=fixture_root); fixture=None; fixture_name=None
    def compact(value): return {"rootAggregates":value["rootAggregates"],"rootMode":value["rootMode"],"wholeSha256":value["wholeSha256"]}
    def five_root_roundtrip(name,present):
      os.mkdir(name,0o700,dir_fd=fixture); case=open_dir(fixture,name); os.mkdir("package",0o751,dir_fd=case); package=open_dir(case,"package"); os.mkdir("mirror",0o700,dir_fd=case); mirror=open_dir(case,"mirror")
      try:
        empty_files=0
        if present:
          for index,parts in enumerate(ROOTS):
            leaf=mkdir_chain(package,parts+["nested"]); os.fchmod(leaf,0o710+index); file=os.open("value",os.O_WRONLY|os.O_CREAT|os.O_EXCL|O_NOFOLLOW,0o640+index,dir_fd=leaf); write_all(file,("root-"+str(index)).encode()); os.close(file); empty=os.open("empty",os.O_WRONLY|os.O_CREAT|os.O_EXCL|O_NOFOLLOW,0o620+index,dir_fd=leaf); os.close(empty); empty_files+=1; os.symlink("value","link",dir_fd=leaf); os.close(leaf)
        before=snapshot_package(package); copy_tree(package,mirror); os.fchmod(mirror,os.fstat(package).st_mode & 0o7777); mirror_snapshot=snapshot_package(mirror); assert mirror_snapshot==before; backup_drift=None; final_drift=None; primary_roundtrip=None
        if present:
          drift_parent=open_chain(package,[".DerivedData","nested"]); drift_stat=os.stat("value",dir_fd=drift_parent,follow_symlinks=False); os.chmod("value",0o600,dir_fd=drift_parent,follow_symlinks=False); backup_drift=snapshot_package(package); os.close(drift_parent); assert backup_drift!=mirror_snapshot
          delete_tree(package); copy_tree(mirror,package); os.fchmod(package,int(before["rootMode"],8)); assert snapshot_package(package)==before
        if present:
          for parts in ROOTS: remove_at(package,parts)
        else:
          for index,parts in enumerate(ROOTS): leaf=mkdir_chain(package,parts); file=os.open("created",os.O_WRONLY|os.O_CREAT|os.O_EXCL|O_NOFOLLOW,0o600,dir_fd=leaf); write_all(file,str(index).encode()); os.close(file); os.close(leaf)
        mutated=snapshot_package(package); assert mutated!=before
        delete_tree(package); copy_tree(mirror,package); os.fchmod(package,int(before["rootMode"],8)); after=snapshot_package(package); assert after==before
        if not present:
          for index,parts in enumerate(ROOTS): leaf=mkdir_chain(package,parts); file=os.open("primary-created",os.O_WRONLY|os.O_CREAT|os.O_EXCL|O_NOFOLLOW,0o600,dir_fd=leaf); write_all(file,("primary-"+str(index)).encode()); os.close(file); os.close(leaf)
          primary_mutated=snapshot_package(package); primary=PrimarySentinel("PRIMARY_OPERATION_FAILURE"); observed={}
          def absent_cleanup():
            outcome=restore_coordinator_bound(package,[(case,"package",package)],mirror,[(case,"mirror",mirror)],before,ROOTS,{".build":1}); error=RuntimeError("custodian restoration failed"); error.cleanup_errors=outcome["errors"]; error.restore_attempts=outcome["attempts"]; observed["error"]=error; raise error
          try: raise_primary_with_cleanup(primary,absent_cleanup)
          except Exception as final: assert final is primary and final.cleanup_causes==[observed["error"]] and final.cleanup_errors==observed["error"].cleanup_errors
          primary_after=restore_exact_bound(package,[(case,"package",package)],mirror,[(case,"mirror",mirror)],before); assert primary_after==before and primary_mutated!=before
          primary_roundtrip={"after":compact(primary_after),"attachedCleanupError":str(observed["error"]),"cleanupErrors":primary.cleanup_errors,"mutated":compact(primary_mutated),"primaryIdentityPreserved":True,"restoreAttempts":primary.restore_attempts}
        if present:
          drift_parent=open_chain(package,[".DerivedData","nested"]); drift_file=os.open("value",os.O_WRONLY|O_NOFOLLOW,dir_fd=drift_parent); write_all(drift_file,b"ROOT-0"); os.fsync(drift_file); os.close(drift_file); os.close(drift_parent); final_drift=snapshot_package(package); assert final_drift!=before
          delete_tree(package); copy_tree(mirror,package); os.fchmod(package,int(before["rootMode"],8)); after=snapshot_package(package); assert after==before
        return {"absentRoots":sum(b'"type":"absent"' in base64.b64decode(stream) for stream in before["rootStreams"]),"after":compact(after),"backupDrift":None if backup_drift is None else compact(backup_drift),"before":compact(before),"emptyFiles":empty_files,"finalDrift":None if final_drift is None else compact(final_drift),"mirror":compact(mirror_snapshot),"mutated":compact(mutated),"primaryRoundtrip":primary_roundtrip}
      finally: os.close(package); os.close(mirror); delete_tree(case); os.close(case); os.rmdir(name,dir_fd=fixture)
    case_before=begin_case("absent-roots"); absent_roundtrip=five_root_roundtrip("absent-five-roots",False); assert absent_roundtrip["absentRoots"]==5
    passed("absent-roots",case_before,roundtrip=absent_roundtrip)
    case_before=begin_case("present-roots"); present_roundtrip=five_root_roundtrip("present-five-roots",True); passed("present-roots",case_before,roundtrip=present_roundtrip)
    for case_name,target in [("absolute-symlink","/outside"),("escaping-symlink","../../outside")]:
      case_before=begin_case(case_name)
      root_component_rejected=None
      if case_name=="escaping-symlink":
        os.symlink("../"+fixture_name+"/outside-dir","root-link",dir_fd=fixture)
        try: inventory_root(fixture,["root-link","nested"]); raise AssertionError("escaping root component accepted")
        except (OSError,RuntimeError): root_component_rejected=True
        finally: os.unlink("root-link",dir_fd=fixture)
      os.mkdir("bad",0o700,dir_fd=fixture); bad=open_dir(fixture,"bad"); os.symlink(target,"link",dir_fd=bad); rejected=False
      try: inventory_root(fixture,["bad"]); raise AssertionError("symlink accepted")
      except RuntimeError: rejected=True
      os.mkdir("bad-copy",0o700,dir_fd=fixture); bad_copy=open_dir(fixture,"bad-copy"); copy_rejected=False
      try: copy_tree(bad,bad_copy); raise AssertionError("copy accepted hostile symlink")
      except RuntimeError: copy_rejected=True
      os.close(bad); os.close(bad_copy); remove_at(fixture,["bad"]); remove_at(fixture,["bad-copy"])
      assert rejected and copy_rejected and (case_name!="escaping-symlink" or root_component_rejected); passed(case_name,case_before,target=target,copyRejected=copy_rejected,rootComponentRejected=root_component_rejected)
    case_before=begin_case("fifo-socket")
    os.mkdir("special",0o700,dir_fd=fixture); special=open_dir(fixture,"special"); os.fchdir(special); os.mkfifo("fifo",0o600); os.fchdir(runner_fd)
    special_errors={}
    try: inventory_root(fixture,["special"]); raise AssertionError("fifo accepted")
    except RuntimeError as error: special_errors["fifo"]=str(error)
    os.mkdir("special-copy",0o700,dir_fd=fixture); special_copy=open_dir(fixture,"special-copy")
    try: copy_tree(special,special_copy); raise AssertionError("copy accepted fifo")
    except RuntimeError as error: special_errors["fifo-copy"]=str(error)
    os.close(special_copy); remove_at(fixture,["special-copy"])
    os.unlink("fifo",dir_fd=special); os.fchdir(special); unix=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM); unix.bind("socket"); os.fchdir(runner_fd)
    try: inventory_root(fixture,["special"]); raise AssertionError("socket accepted")
    except RuntimeError as error: special_errors["socket"]=str(error)
    os.mkdir("special-copy",0o700,dir_fd=fixture); special_copy=open_dir(fixture,"special-copy")
    try: copy_tree(special,special_copy); raise AssertionError("copy accepted socket")
    except RuntimeError as error: special_errors["socket-copy"]=str(error)
    os.close(special_copy); remove_at(fixture,["special-copy"]); unix.close(); os.unlink("socket",dir_fd=special); os.close(special); remove_at(fixture,["special"]); assert list(sorted(special_errors))==["fifo","fifo-copy","socket","socket-copy"]; passed("fifo-socket",case_before,errors=special_errors)
    case_before=begin_case("duplicate-inode")
    os.mkdir("hard",0o700,dir_fd=fixture); hard=open_dir(fixture,"hard"); f=os.open("a",os.O_WRONLY|os.O_CREAT|os.O_EXCL|O_NOFOLLOW,0o600,dir_fd=hard); os.write(f,b"x"); os.close(f); os.fchdir(hard); os.link("a","b"); os.fchdir(runner_fd)
    link_counts={name:os.stat(name,dir_fd=hard,follow_symlinks=False).st_nlink for name in ["a","b"]}; hard_error=None
    try: inventory_root(fixture,["hard"]); raise AssertionError("hard link accepted")
    except RuntimeError as error: hard_error=str(error)
    os.mkdir("hard-copy",0o700,dir_fd=fixture); hard_copy=open_dir(fixture,"hard-copy"); hard_copy_error=None
    try: copy_tree(hard,hard_copy); raise AssertionError("copy accepted hard link")
    except RuntimeError as error: hard_copy_error=str(error)
    os.close(hard_copy); remove_at(fixture,["hard-copy"]); os.unlink("a",dir_fd=hard); os.unlink("b",dir_fd=hard); os.close(hard); remove_at(fixture,["hard"]); assert link_counts=={"a":2,"b":2} and hard_error and hard_copy_error; passed("duplicate-inode",case_before,error=hard_error,copyError=hard_copy_error,linkCounts=link_counts)

    case_before=begin_case("final-substitution")
    os.mkdir("final",0o700,dir_fd=fixture); final=open_dir(fixture,"final"); f=os.open("victim",os.O_WRONLY|os.O_CREAT|os.O_EXCL|O_NOFOLLOW,0o600,dir_fd=final); os.write(f,b"same"); os.close(f)
    def final_symlink_hook(stage, context):
      if stage=="inventory-before-file-open" and context["name"]=="victim": os.rename("victim","saved",src_dir_fd=context["parent_fd"],dst_dir_fd=context["parent_fd"]); os.symlink("../outside","victim",dir_fd=context["parent_fd"])
    test_hook=final_symlink_hook; symlink_rejected=False
    try: inventory_root(fixture,["final"])
    except (OSError,RuntimeError): symlink_rejected=True
    finally: test_hook=None; os.unlink("victim",dir_fd=final); os.rename("saved","victim",src_dir_fd=final,dst_dir_fd=final)
    def final_file_hook(stage, context):
      if stage=="inventory-before-file-open" and context["name"]=="victim":
        os.rename("victim","saved",src_dir_fd=context["parent_fd"],dst_dir_fd=context["parent_fd"]); replacement=os.open("victim",os.O_WRONLY|os.O_CREAT|os.O_EXCL|O_NOFOLLOW,0o600,dir_fd=context["parent_fd"]); os.write(replacement,b"same"); os.close(replacement)
    test_hook=final_file_hook; identity_rejected=False
    try: inventory_root(fixture,["final"])
    except RuntimeError: identity_rejected=True
    finally: test_hook=None; os.unlink("victim",dir_fd=final); os.rename("saved","victim",src_dir_fd=final,dst_dir_fd=final)
    os.mkdir("final-copy",0o700,dir_fd=fixture); final_copy=open_dir(fixture,"final-copy")
    def copy_symlink_hook(stage, context):
      if stage=="copy-before-file-open" and context["name"]=="victim": os.rename("victim","saved",src_dir_fd=context["src_fd"],dst_dir_fd=context["src_fd"]); os.symlink("../outside","victim",dir_fd=context["src_fd"])
    test_hook=copy_symlink_hook; copy_rejected=False
    try: copy_tree(final,final_copy)
    except (OSError,RuntimeError): copy_rejected=True
    finally: test_hook=None; os.unlink("victim",dir_fd=final); os.rename("saved","victim",src_dir_fd=final,dst_dir_fd=final)
    os.close(final_copy); remove_at(fixture,["final-copy"]); os.mkdir("final-copy",0o700,dir_fd=fixture); final_copy=open_dir(fixture,"final-copy")
    def copy_same_byte_hook(stage, context):
      if stage=="copy-before-file-open" and context["name"]=="victim": os.rename("victim","saved",src_dir_fd=context["src_fd"],dst_dir_fd=context["src_fd"]); replacement=os.open("victim",os.O_WRONLY|os.O_CREAT|os.O_EXCL|O_NOFOLLOW,0o600,dir_fd=context["src_fd"]); write_all(replacement,b"same"); os.close(replacement)
    test_hook=copy_same_byte_hook; copy_identity_rejected=False
    try: copy_tree(final,final_copy)
    except RuntimeError: copy_identity_rejected=True
    finally: test_hook=None; os.unlink("victim",dir_fd=final); os.rename("saved","victim",src_dir_fd=final,dst_dir_fd=final)
    os.close(final_copy); remove_at(fixture,["final-copy"]); directory=mkdir_chain(final,["directory"]); f=os.open("file",os.O_WRONLY|os.O_CREAT|os.O_EXCL|O_NOFOLLOW,0o600,dir_fd=directory); write_all(f,b"same"); os.close(f); os.close(directory); os.mkdir("final-copy",0o700,dir_fd=fixture); final_copy=open_dir(fixture,"final-copy")
    def copy_directory_hook(stage, context):
      if stage=="copy-after-directory-open" and context["name"]=="directory": os.rename("directory","saved-directory",src_dir_fd=context["src_fd"],dst_dir_fd=context["src_fd"]); replacement=mkdir_chain(context["src_fd"],["directory"]); f=os.open("file",os.O_WRONLY|os.O_CREAT|os.O_EXCL|O_NOFOLLOW,0o600,dir_fd=replacement); write_all(f,b"same"); os.close(f); os.close(replacement)
    test_hook=copy_directory_hook; directory_rejected=False
    try: copy_tree(final,final_copy)
    except RuntimeError: directory_rejected=True
    finally: test_hook=None; remove_at(final,["directory"]); os.rename("saved-directory","directory",src_dir_fd=final,dst_dir_fd=final)
    os.mkdir("artifact",0o700,dir_fd=fixture); artifact=open_dir(fixture,"artifact"); artifact_file=os.open("victim",os.O_WRONLY|os.O_CREAT|os.O_EXCL|O_NOFOLLOW,0o600,dir_fd=artifact); write_all(artifact_file,b"same"); os.close(artifact_file)
    def artifact_hook(stage,context):
      if stage=="artifact-before-file-open" and context["name"]=="victim": os.rename("victim","saved",src_dir_fd=context["parent_fd"],dst_dir_fd=context["parent_fd"]); replacement=os.open("victim",os.O_WRONLY|os.O_CREAT|os.O_EXCL|O_NOFOLLOW,0o600,dir_fd=context["parent_fd"]); write_all(replacement,b"same"); os.close(replacement)
    test_hook=artifact_hook; artifact_rejected=False
    try: artifact_record([fixture_name,"artifact","victim"],0o600)
    except RuntimeError: artifact_rejected=True
    finally: test_hook=None; os.unlink("victim",dir_fd=artifact); os.rename("saved","victim",src_dir_fd=artifact,dst_dir_fd=artifact)
    os.close(artifact); remove_at(fixture,["artifact"]); assert symlink_rejected and identity_rejected and copy_rejected and copy_identity_rejected and directory_rejected and artifact_rejected; os.close(final); os.close(final_copy); remove_at(fixture,["final"]); remove_at(fixture,["final-copy"]); passed("final-substitution",case_before,artifactRejected=artifact_rejected,copyRejected=copy_rejected,copyIdentityRejected=copy_identity_rejected,directoryRejected=directory_rejected,identityRejected=identity_rejected,symlinkRejected=symlink_rejected)

    case_before=begin_case("ancestor-substitution")
    os.mkdir("ancestor",0o700,dir_fd=fixture); ancestor=open_dir(fixture,"ancestor"); os.mkdir("dir",0o700,dir_fd=ancestor); held=open_dir(ancestor,"dir"); f=os.open("file",os.O_WRONLY|os.O_CREAT|os.O_EXCL|O_NOFOLLOW,0o600,dir_fd=held); os.write(f,b"held"); os.close(f); os.close(held)
    def ancestor_hook(target):
      def hook(stage, context):
        if stage=="inventory-after-directory-open" and context["name"]=="dir": os.rename("dir","moved",src_dir_fd=context["parent_fd"],dst_dir_fd=context["parent_fd"]); os.symlink(target,"dir",dir_fd=context["parent_fd"])
      return hook
    moved_rejected=False; test_hook=ancestor_hook("moved")
    try: inventory_root(fixture,["ancestor"])
    except RuntimeError: moved_rejected=True
    finally: test_hook=None; os.unlink("dir",dir_fd=ancestor); os.rename("moved","dir",src_dir_fd=ancestor,dst_dir_fd=ancestor)
    outside_rejected=False; test_hook=ancestor_hook("../outside-dir")
    try: inventory_root(fixture,["ancestor"])
    except RuntimeError: outside_rejected=True
    finally: test_hook=None; os.unlink("dir",dir_fd=ancestor); os.rename("moved","dir",src_dir_fd=ancestor,dst_dir_fd=ancestor)
    held=open_dir(ancestor,"dir"); check=os.open("file",os.O_RDONLY|O_NOFOLLOW,dir_fd=held); held_bytes=os.read(check,4); os.close(check); os.close(held); assert moved_rejected and outside_rejected and held_bytes==b"held"; os.close(ancestor)
    def delete_ancestor_hook(stage, context):
      if stage=="delete-after-root-open" and context["name"]=="ancestor": os.rename("ancestor","ancestor-moved",src_dir_fd=context["parent_fd"],dst_dir_fd=context["parent_fd"]); os.symlink("outside-dir","ancestor",dir_fd=context["parent_fd"])
    test_hook=delete_ancestor_hook; delete_rejected=False
    try: remove_at(fixture,["ancestor"])
    except RuntimeError: delete_rejected=True
    finally: test_hook=None; os.unlink("ancestor",dir_fd=fixture); os.rename("ancestor-moved","ancestor",src_dir_fd=fixture,dst_dir_fd=fixture)
    remove_at(fixture,["ancestor"]); os.mkdir("restore-package",0o700,dir_fd=fixture); restore_package=open_dir(fixture,"restore-package"); os.mkdir("restore-mirror",0o700,dir_fd=fixture); restore_mirror=open_dir(fixture,"restore-mirror"); leaf=mkdir_chain(restore_package,["restore-root","dir"]); restored_file=os.open("file",os.O_WRONLY|os.O_CREAT|os.O_EXCL|O_NOFOLLOW,0o640,dir_fd=leaf); write_all(restored_file,b"restore"); os.close(restored_file); os.close(leaf); restore_baseline=snapshot_package(restore_package); copy_tree(restore_package,restore_mirror); os.fchmod(restore_mirror,os.fstat(restore_package).st_mode & 0o7777); remove_at_bound(restore_package,["restore-root"],[(fixture,"restore-package",restore_package)])
    def restore_ancestor_hook(stage,context):
      if stage=="copy-after-directory-open" and context["dst_fd"]==restore_package and context["name"]=="restore-root": os.rename("restore-root","restore-root-moved",src_dir_fd=restore_package,dst_dir_fd=restore_package); os.symlink("../outside-dir","restore-root",dir_fd=restore_package)
    test_hook=restore_ancestor_hook; restore_rejected=False
    try: restore_exact_bound(restore_package,[(fixture,"restore-package",restore_package)],restore_mirror,[(fixture,"restore-mirror",restore_mirror)],restore_baseline)
    except RuntimeError: restore_rejected=True
    finally: test_hook=None; os.unlink("restore-root",dir_fd=restore_package); os.rename("restore-root-moved","restore-root",src_dir_fd=restore_package,dst_dir_fd=restore_package)
    restore_after=restore_exact_bound(restore_package,[(fixture,"restore-package",restore_package)],restore_mirror,[(fixture,"restore-mirror",restore_mirror)],restore_baseline); assert restore_after==restore_baseline; os.close(restore_package); os.close(restore_mirror); remove_at(fixture,["restore-package"]); remove_at(fixture,["restore-mirror"]); assert delete_rejected and restore_rejected; passed("ancestor-substitution",case_before,deleteRejected=delete_rejected,movedRejected=moved_rejected,outsideRejected=outside_rejected,restoreRejected=restore_rejected)

    case_before=begin_case("escaped-writes")
    for value in ["", "..", "a/b", "/absolute"]:
      try: component(value); raise AssertionError("escaped write accepted")
      except ValueError: pass
    os.symlink("outside-dir","write-link",dir_fd=fixture); parent_rejected=False
    try: mkdir_chain(fixture,["write-link","child"])
    except (OSError,RuntimeError): parent_rejected=True
    write_owned_rejected=False
    try: write_owned(["write-link","owned"],b"blocked",0o600,fixture)
    except (OSError,RuntimeError): write_owned_rejected=True
    os.unlink("write-link",dir_fd=fixture); os.mkdir("write-race",0o700,dir_fd=fixture); race=open_dir(fixture,"write-race"); os.mkdir("held",0o700,dir_fd=race); os.close(race)
    def write_ancestor_hook(stage,context):
      if stage=="write-owned-after-traversal": os.rename("write-race","write-race-moved",src_dir_fd=fixture,dst_dir_fd=fixture); os.symlink("outside-dir","write-race",dir_fd=fixture)
    test_hook=write_ancestor_hook; held_ancestor_rejected=False
    try: write_owned(["write-race","held","owned"],b"blocked",0o600,fixture,[(fixture_root,fixture_name,fixture)])
    except (OSError,RuntimeError): held_ancestor_rejected=True
    finally: test_hook=None; os.unlink("write-race",dir_fd=fixture); os.rename("write-race-moved","write-race",src_dir_fd=fixture,dst_dir_fd=fixture)
    remove_at_bound(fixture,["write-race"],[(fixture_root,fixture_name,fixture)]); assert parent_rejected and write_owned_rejected and held_ancestor_rejected; passed("escaped-writes",case_before,heldAncestorRejected=held_ancestor_rejected,invalidComponents=["","..","a/b","/absolute"],symlinkParentRejected=parent_rejected,writeOwnedRejected=write_owned_rejected)

    case_before=begin_case("mode-byte-drift",True)
    baseline_mode_bytes=inventory_root(fixture,["present"]); present=open_dir(fixture,"present"); nested=open_dir(present,"nested"); original_file=os.stat("file",dir_fd=nested,follow_symlinks=False); os.chmod("file",0o600,dir_fd=nested,follow_symlinks=False); mode_drift=inventory_root(fixture,["present"]); os.chmod("file",original_file.st_mode & 0o7777,dir_fd=nested,follow_symlinks=False); fd=os.open("file",os.O_WRONLY|O_NOFOLLOW,dir_fd=nested); os.write(fd,b"BYTES"); os.close(fd); byte_drift=inventory_root(fixture,["present"]); fd=os.open("file",os.O_WRONLY|os.O_TRUNC|O_NOFOLLOW,dir_fd=nested); os.write(fd,b"bytes"); os.close(fd); os.close(nested); os.close(present); restored_mode_bytes=inventory_root(fixture,["present"]); assert mode_drift!=baseline_mode_bytes and byte_drift!=baseline_mode_bytes and restored_mode_bytes==baseline_mode_bytes; passed("mode-byte-drift",case_before,after=restored_mode_bytes,before=baseline_mode_bytes,byteDrift=byte_drift,modeDrift=mode_drift)

    case_before=begin_case("primary-restore-order")
    os.mkdir("restore-package",0o700,dir_fd=fixture); restore_package_fd=open_dir(fixture,"restore-package"); os.mkdir("restore-backup",0o700,dir_fd=fixture); restore_backup_fd=open_dir(fixture,"restore-backup")
    for index,parts in enumerate(ROOTS):
      leaf=mkdir_chain(restore_package_fd,parts); f=os.open("value",os.O_WRONLY|os.O_CREAT|os.O_EXCL|O_NOFOLLOW,0o600+index,dir_fd=leaf); write_all(f,("baseline-"+str(index)).encode()); os.close(f); os.close(leaf)
    restore_baseline=snapshot_package(restore_package_fd); copy_tree(restore_package_fd,restore_backup_fd); os.fchmod(restore_backup_fd,os.fstat(restore_package_fd).st_mode & 0o7777); assert snapshot_package(restore_backup_fd)==restore_baseline
    for index,parts in enumerate(ROOTS):
      leaf=open_chain(restore_package_fd,parts); changed=os.open("changed",os.O_WRONLY|os.O_CREAT|os.O_EXCL|O_NOFOLLOW,0o640,dir_fd=leaf); write_all(changed,b"mutation"); os.close(changed); os.close(leaf)
    primary=RuntimeError("PRIMARY_OPERATION_FAILURE"); injected={".build":2,".generated":1,"Products/ExpoModulesJSI.xcframework":1}; failed=restore_coordinator_bound(restore_package_fd,[(fixture,"restore-package",restore_package_fd)],restore_backup_fd,[(fixture,"restore-backup",restore_backup_fd)],restore_baseline,ROOTS,injected)
    expected_errors=[{"phase":"restore","path":".build","errorCode":"EIO"},{"phase":"restore","path":".generated","errorCode":"EIO"},{"phase":"restore","path":"Products/ExpoModulesJSI.xcframework","errorCode":"EIO"}]; assert failed["errors"]==expected_errors and [item["path"] for item in failed["attempts"]]==[".DerivedData",".build",".build",".generated",".swiftpm","Products/ExpoModulesJSI.xcframework"]
    ordered=[str(primary)]+[item["phase"]+":"+item["path"]+":"+item["errorCode"] for item in failed["errors"]]; restored_fixture=restore_coordinator_bound(restore_package_fd,[(fixture,"restore-package",restore_package_fd)],restore_backup_fd,[(fixture,"restore-backup",restore_backup_fd)],restore_baseline,ROOTS); assert restored_fixture["errors"]==[] and snapshot_package(restore_package_fd)==restore_baseline
    os.close(restore_package_fd); os.close(restore_backup_fd); remove_at(fixture,["restore-package"]); remove_at(fixture,["restore-backup"]); passed("primary-restore-order",case_before,attempts=failed["attempts"],cleanupErrors=failed["errors"],ordered=ordered,uniqueCount=len(failed["errors"]),teardownAggregates=restore_baseline["rootAggregates"])


    case_before=begin_case("residue-free",True)
    assert inventory_root(fixture,["present"]) == present_before
    outside_after=os.stat("outside",dir_fd=fixture,follow_symlinks=False); outside_fd=os.open("outside",os.O_RDONLY|O_NOFOLLOW,dir_fd=fixture); outside_bytes=os.read(outside_fd,len(outside)+1); os.close(outside_fd); assert same(outside_before,outside_after) and mode(outside_before)==mode(outside_after) and outside_bytes==outside and inventory_root(fixture,["outside-dir"])==outside_inventory
    actual_entries=sorted(os.listdir(fixture),key=lambda value:value.encode()); expected_entries=["outside","outside-dir","present"]; assert actual_entries==expected_entries
    passed("residue-free",case_before,actualEntries=actual_entries,expectedEntries=expected_entries,presentAfter=inventory_root(fixture,["present"]),presentBefore=present_before)
    case_before=begin_case("var-alias-exclusion")
    control = True
    if sys.platform == "darwin":
      slash=os.open("/",os.O_RDONLY|O_DIRECTORY|O_NOFOLLOW)
      try:
        try: os.open("var",os.O_RDONLY|O_DIRECTORY|O_NOFOLLOW,dir_fd=slash); control=False
        except OSError: control=True
      finally: os.close(slash)
    assert control; passed("var-alias-exclusion",case_before,ambientTmp=os.environ.get("TMPDIR"),physicalRepository=physical_cwd,strictControlRejected=control)
    assert list(results.keys())==cases and os.listdir(fixture_root)==[]
    return {"schema":"allnewmts.g011.nofollow-regression.v1","cases":cases,"results":results,"passed":sum(1 for value in results.values() if value["passed"]),"outsideUnchanged":all(value["oracle"]["before"]==value["oracle"]["after"] for value in results.values()),"residueFree":results["residue-free"]["actualEntries"]==results["residue-free"]["expectedEntries"],"physicalRepository":physical_cwd,"ambientTmpIgnored":results["var-alias-exclusion"]["ambientTmp"]!="/var/folders/allnewmts-hostile-alias","varAliasExcluded":results["var-alias-exclusion"]["strictControlRejected"],"primaryFirst":results["primary-restore-order"]["ordered"][0]=="PRIMARY_OPERATION_FAILURE","cleanupRootOrder":[".DerivedData",".build",".generated",".swiftpm","Products/ExpoModulesJSI.xcframework"]}
  finally:
    if fixture is not None: delete_tree(fixture); os.close(fixture); os.rmdir(fixture_name,dir_fd=fixture_root)
    os.close(fixture_root)

def write_owned(parts, data, file_mode, base_fd=None, base_chain=None):
  start=runner_fd if base_fd is None else base_fd
  binding=[(tmp_fd,runner_name,runner_fd)] if base_chain is None and base_fd is None else ([] if base_chain is None else base_chain)
  parent,chain,opened=mkdir_chain_bound(start,parts[:-1],binding)
  fd=-1
  try:
    name=component(parts[-1]); fire_hook("write-owned-after-traversal",parent_fd=parent,name=name,chain=chain); recheck_chain(chain)
    fd=os.open(name,os.O_RDWR|os.O_CREAT|os.O_EXCL|O_NOFOLLOW,file_mode,dir_fd=parent)
    opened_stat=os.fstat(fd)
    if not stat.S_ISREG(opened_stat.st_mode) or opened_stat.st_nlink!=1: raise RuntimeError("owned write target is not unique regular file")
    view=memoryview(data)
    while view:
      count=os.write(fd,view)
      if count<=0: raise RuntimeError("write no progress")
      view=view[count:]
    os.fsync(fd); os.fchmod(fd,file_mode); os.lseek(fd,0,os.SEEK_SET); observed=os.read(fd,len(data)+1)
    final_fd=os.fstat(fd); final_path=os.stat(name,dir_fd=parent,follow_symlinks=False); recheck_chain(chain)
    if observed!=data or not same(final_fd,final_path) or final_fd.st_mode!=final_path.st_mode or final_fd.st_size!=len(data) or final_fd.st_nlink!=1 or (final_fd.st_mode & 0o7777)!=file_mode: raise RuntimeError("owned write verification failed")
    return {"dev":str(final_fd.st_dev),"ino":str(final_fd.st_ino),"mode":mode(final_fd),"size":str(final_fd.st_size),"sha256":hashlib.sha256(observed).hexdigest(),"type":"file"}
  finally:
    if fd>=0: os.close(fd)
    close_opened(opened)

def artifact_record(parts, expected_mode):
  parent,chain,opened=open_chain_bound(runner_fd,parts[:-1],[] if tmp_fd<0 else [(tmp_fd,runner_name,runner_fd)])
  fd=-1
  try:
    name=component(parts[-1]); before=os.stat(name,dir_fd=parent,follow_symlinks=False); fire_hook("artifact-before-file-open",parent_fd=parent,name=name,stat=before); recheck_chain(chain); fd=os.open(name,os.O_RDONLY|O_NOFOLLOW,dir_fd=parent); opened_stat=os.fstat(fd)
    if not stat.S_ISREG(opened_stat.st_mode) or opened_stat.st_nlink!=1 or (opened_stat.st_mode & 0o7777)!=expected_mode or not same(before,opened_stat) or before.st_mode!=opened_stat.st_mode or before.st_size!=opened_stat.st_size: raise RuntimeError("artifact identity/mode mismatch")
    data=b""
    while len(data)<opened_stat.st_size:
      chunk=os.read(fd,opened_stat.st_size-len(data))
      if not chunk: raise RuntimeError("artifact short read")
      data+=chunk
    if os.read(fd,1): raise RuntimeError("artifact long read")
    after=os.stat(name,dir_fd=parent,follow_symlinks=False); recheck_chain(chain)
    if not same(opened_stat,after) or opened_stat.st_mode!=after.st_mode or opened_stat.st_size!=after.st_size or after.st_nlink!=1: raise RuntimeError("artifact substitution")
    return {"dev":str(opened_stat.st_dev),"ino":str(opened_stat.st_ino),"mode":mode(opened_stat),"size":str(opened_stat.st_size),"sha256":hashlib.sha256(data).hexdigest(),"type":"file"}
  finally:
    if fd>=0: os.close(fd)
    close_opened(opened)

def validate_artifact(parts):
  key="/".join(parts)
  if key not in artifacts: raise RuntimeError("unrecorded artifact")
  current=artifact_record(parts,int(artifacts[key]["mode"],8))
  if current!=artifacts[key]: raise RuntimeError("artifact substitution")
  return current

def launch_promotion(substitute=False):
  record=validate_artifact(["shim-bin","xcodebuild"]); shim_fd,shim_chain,shim_opened=open_chain_bound(runner_fd,["shim"],[(tmp_fd,runner_name,runner_fd)]); artifact_parent,artifact_chain,artifact_opened=open_chain_bound(runner_fd,["shim-bin"],[(tmp_fd,runner_name,runner_fd)]); artifact_st=os.stat("xcodebuild",dir_fd=artifact_parent,follow_symlinks=False); artifact_fd=os.open("xcodebuild",os.O_RDONLY|O_NOFOLLOW,dir_fd=artifact_parent)
  try:
    if not same(artifact_st,os.fstat(artifact_fd)): raise RuntimeError("artifact identity changed before worker")
    return run_worker("promotion-worker",120,package_fd,shim_fd,artifact_fd=artifact_fd,artifact_record=record,promotion_substitute=substitute)[0]
  finally: os.close(artifact_fd); close_opened(artifact_opened); close_opened(shim_opened)

def snapshot_package(fd, chain=[]):
  roots=[inventory_root_bound(fd,parts,chain) for parts in ROOTS]
  whole="".join(inventory_dir(fd,[],set(),chain)).encode()
  return {"rootStreams":[item["streamBase64"] for item in roots],"rootAggregates":[item["sha256"] for item in roots],"wholeStreamBase64":base64.b64encode(whole).decode(),"wholeSha256":hashlib.sha256(whole).hexdigest(),"rootMode":mode(os.fstat(fd))}

def worker_main():
  global test_hook,package_fd,runner_fd,physical_cwd
  source=int(os.environ.pop("ALLNEWMTS_WORKER_SOURCE_FD","-1")); other=int(os.environ.pop("ALLNEWMTS_WORKER_OTHER_FD","-1")); artifact_fd=int(os.environ.pop("ALLNEWMTS_WORKER_ARTIFACT_FD","-1"))
  hang=os.environ.pop("ALLNEWMTS_WORKER_HANG", "0")=="1"; resist=os.environ.pop("ALLNEWMTS_WORKER_RESIST", "0")=="1"; mutate_then_hang=os.environ.pop("ALLNEWMTS_MUTATE_THEN_HANG", "0")=="1"
  if hang and not mutate_then_hang:
    signal.signal(signal.SIGTERM, (lambda *_: None) if resist else signal.SIG_DFL)
    while True: time.sleep(1)
  if os.environ.pop("ALLNEWMTS_WORKER_FAIL", "0")=="1": raise RuntimeError("injected worker failure")
  if ROLE=="copy-worker":
    before=snapshot_package(source); copy_tree(source,other); os.fchmod(other,os.fstat(source).st_mode & 0o7777); value={"source":before,"staging":snapshot_package(other)}
  elif ROLE=="verify-worker": value={"source":snapshot_package(source),"staging":snapshot_package(other)}
  elif ROLE=="inventory-worker":
    requested=os.environ.pop("ALLNEWMTS_INVENTORY_PATHS","")
    if requested:
      paths=json.loads(base64.b64decode(requested,validate=True)); value={"paths":[{"id":parts[-1],**inventory_root_bound(source,[component(part) for part in parts],[])} for parts in paths]}
    else: value={"package":snapshot_package(source)}
  elif ROLE=="drift-worker":
    drift=os.environ.pop("ALLNEWMTS_WORKER_MODE")
    before=snapshot_package(source)
    if drift=="mode":
      fd=os.open("Package.swift",os.O_RDWR|O_NOFOLLOW,dir_fd=source); original=os.fstat(fd); os.fchmod(fd,(original.st_mode & 0o7777)^0o020); os.close(fd)
    elif drift=="byte":
      fd=os.open("Package.swift",os.O_RDWR|O_NOFOLLOW,dir_fd=source); first=os.read(fd,1); os.lseek(fd,0,os.SEEK_SET); write_all(fd,b"#" if first!=b"#" else b"/"); os.fsync(fd); os.close(fd)
    elif drift=="coordinator":
      for parts in ROOTS:
        current=inventory_root_bound(source,parts,[])
        if b'"type":"absent"' in base64.b64decode(current["streamBase64"]): leaf=mkdir_chain(source,parts); fd=os.open("hostile",os.O_WRONLY|os.O_CREAT|os.O_EXCL|O_NOFOLLOW,0o600,dir_fd=leaf); write_all(fd,b"hostile"); os.close(fd); os.close(leaf)
        else: remove_at_bound(source,parts,[])
    else: raise RuntimeError("unknown drift mode")
    mutated=snapshot_package(source); assert mutated!=before; value={"before":before,"mutated":mutated,"mode":drift}
  elif ROLE=="promotion-worker":
    package_fd=source; runner_fd=other
    expected=json.loads(base64.b64decode(os.environ.pop("ALLNEWMTS_WORKER_ARTIFACT_RECORD"),validate=True)); st=os.fstat(artifact_fd); os.lseek(artifact_fd,0,os.SEEK_SET); data=b""
    while len(data)<st.st_size:
      chunk=os.read(artifact_fd,st.st_size-len(data))
      if not chunk: raise RuntimeError("artifact short read")
      data+=chunk
    if os.read(artifact_fd,1): raise RuntimeError("artifact long read")
    current={"dev":str(st.st_dev),"ino":str(st.st_ino),"mode":mode(st),"size":str(st.st_size),"sha256":hashlib.sha256(data).hexdigest(),"type":"file"}
    if current!=expected: raise RuntimeError("artifact substitution")
    substitute=os.environ.pop("ALLNEWMTS_PROMOTION_SUBSTITUTE","0")=="1"
    if substitute:
      def promotion_parent_hook(stage,context):
        if stage=="open-chain-after-directory-open" and context["parent_fd"]==runner_fd and context["name"]=="staged": os.rename("staged","staged-moved",src_dir_fd=runner_fd,dst_dir_fd=runner_fd); os.symlink("staged-moved","staged",dir_fd=runner_fd)
      test_hook=promotion_parent_hook
    try: value=promote_swiftpm()
    finally:
      if substitute:
        test_hook=None
        try: os.unlink("staged",dir_fd=runner_fd); os.rename("staged-moved","staged",src_dir_fd=runner_fd,dst_dir_fd=runner_fd)
        except OSError: pass
  elif ROLE=="regression-worker": runner_fd=source; value=regression()
  elif ROLE=="mutation-worker":
    before=snapshot_package(source); created=os.open("g011-revision10-created",os.O_WRONLY|os.O_CREAT|os.O_EXCL|O_NOFOLLOW,0o640,dir_fd=source); write_all(created,b"created\n"); os.fsync(created); os.close(created)
    os.mkdir("g011-revision10-directory",0o711,dir_fd=source); directory=open_dir(source,"g011-revision10-directory"); os.symlink("../g011-revision10-created","link",dir_fd=directory); os.close(directory)
    changed=os.open("Package.swift",os.O_RDWR|O_NOFOLLOW,dir_fd=source); original=os.read(changed,1); os.lseek(changed,0,os.SEEK_SET); write_all(changed,b"/" if original!=b"/" else b"#"); os.fsync(changed); os.close(changed)
    mutated=snapshot_package(source); compact=lambda item:{"rootAggregates":item["rootAggregates"],"rootMode":item["rootMode"],"wholeSha256":item["wholeSha256"]}; value={"before":compact(before),"mutated":compact(mutated)}
    if mutate_then_hang:
      signal.signal(signal.SIGTERM, (lambda *_: None) if resist else signal.SIG_DFL)
      while True: time.sleep(1)
  else: raise RuntimeError("unknown worker role")
  sys.stdout.write(json.dumps(value,separators=(",",":"),sort_keys=True)+"\n"); sys.stdout.flush()

JOURNAL_SCHEMA="allnewmts.g011.custodian-journal.v1"
JOURNAL_KEYS=["baselineRootAggregates","baselineWholeAggregate","mirrorAggregate","packageIdentity","phase","previousRecordSha256","reason","runnerIdentity","schema","sequence","state"]
JOURNAL_STATES=["ANCHORED","BASELINE_COMMITTED","MUTATION_ARMED","RESTORING","RESTORED"]
journal_fd=None; journal_records=[]; journal_last=None; mutation_armed=False; restored=False; restoration_reason=None
package_fd=None; package_chain=[]; package_opened=[]; backup_fd=None; backup_chain=[]; backup_opened=[]; mirror_fd=None

def write_all(fd,data):
  view=memoryview(data)
  while view:
    count=os.write(fd,view)
    if count<=0: raise RuntimeError("write no progress")
    view=view[count:]

def identity(fd):
  st=os.fstat(fd); return {"dev":str(st.st_dev),"ino":str(st.st_ino),"mode":mode(st),"type":"directory"}

def is_hex(value): return isinstance(value,str) and len(value)==64 and all(character in "0123456789abcdef" for character in value)
def valid_identity(value): return isinstance(value,dict) and list(sorted(value))==["dev","ino","mode","type"] and value["type"]=="directory" and value["dev"].isdigit() and value["ino"].isdigit() and len(value["mode"])==4 and all(character in "01234567" for character in value["mode"])

def validate_journal(records, expected_count):
  if len(records)!=expected_count or expected_count<1 or expected_count>5: raise RuntimeError("journal record count")
  previous=None; invariant=None; package_identity=None; runner_identity=None; restore_reason=None
  for index,line_bytes in enumerate(records):
    try: value=json.loads(line_bytes.decode("utf-8"))
    except Exception as error: raise RuntimeError("journal JSON") from error
    if (json.dumps(value,separators=(",",":"),sort_keys=True)+"\n").encode()!=line_bytes: raise RuntimeError("journal canonical mismatch")
    if list(sorted(value))!=JOURNAL_KEYS or value["schema"]!=JOURNAL_SCHEMA: raise RuntimeError("journal schema/keys")
    if type(value["sequence"]) is not int or value["sequence"]!=index or value["state"]!=JOURNAL_STATES[index]: raise RuntimeError("journal transition")
    if value["previousRecordSha256"]!=previous or (index and not is_hex(value["previousRecordSha256"])): raise RuntimeError("journal prior hash")
    if not valid_identity(value["packageIdentity"]) or not valid_identity(value["runnerIdentity"]): raise RuntimeError("journal identity shape")
    if index==0: package_identity=value["packageIdentity"]; runner_identity=value["runnerIdentity"]
    elif value["packageIdentity"]!=package_identity or value["runnerIdentity"]!=runner_identity: raise RuntimeError("journal identity drift")
    claims=(value["baselineRootAggregates"],value["baselineWholeAggregate"],value["mirrorAggregate"])
    if index==0:
      if claims!=(None,None,None) or value["phase"] is not None or value["reason"] is not None or value["previousRecordSha256"] is not None: raise RuntimeError("ANCHORED null contract")
    else:
      roots=value["baselineRootAggregates"]
      if not isinstance(roots,list) or len(roots)!=5 or [item.get("path") for item in roots]!=[".DerivedData",".build",".swiftpm",".generated","Products/ExpoModulesJSI.xcframework"]: raise RuntimeError("journal root order")
      if any(list(sorted(item))!=["path","sha256"] or not is_hex(item["sha256"]) for item in roots) or not is_hex(value["baselineWholeAggregate"]) or not is_hex(value["mirrorAggregate"]): raise RuntimeError("journal aggregate grammar")
      if value["mirrorAggregate"]!=value["baselineWholeAggregate"]: raise RuntimeError("journal mirror aggregate")
      if invariant is None: invariant=claims
      elif claims!=invariant: raise RuntimeError("journal aggregate drift")
    if index<2 and (value["phase"] is not None or value["reason"] is not None): raise RuntimeError("journal premature phase")
    if index==2 and (value["phase"]!="prebuild" or value["reason"] is not None): raise RuntimeError("journal arm contract")
    if index>=3:
      if value["phase"]!="prebuild" or value["reason"] not in ("success","failure"): raise RuntimeError("journal restore contract")
      if restore_reason is None: restore_reason=value["reason"]
      elif value["reason"]!=restore_reason: raise RuntimeError("journal reason drift")
    previous=hashlib.sha256(line_bytes).hexdigest()
  return previous

def journal_readback():
  expected=b"".join(journal_records); os.lseek(journal_fd,0,os.SEEK_SET); actual=b""
  while len(actual)<len(expected):
    chunk=os.read(journal_fd,len(expected)-len(actual))
    if not chunk: break
    actual+=chunk
  if actual!=expected or os.read(journal_fd,1): raise RuntimeError("journal read-back mismatch")
  os.lseek(journal_fd,0,os.SEEK_END)

def journal_record(state, sequence, phase=None, reason=None, previous=None):
  aggregates=None if baseline is None else [{"path":"/".join(parts),"sha256":baseline["rootAggregates"][index]} for index,parts in enumerate(ROOTS)]
  return {"baselineRootAggregates":aggregates,"baselineWholeAggregate":None if baseline is None else baseline["wholeSha256"],"mirrorAggregate":None if baseline is None else baseline["wholeSha256"],"packageIdentity":identity(package_fd),"phase":phase,"previousRecordSha256":previous,"reason":reason,"runnerIdentity":identity(runner_fd),"schema":JOURNAL_SCHEMA,"sequence":sequence,"state":state}

def journal_append(state, sequence, phase=None, reason=None):
  global journal_last
  record=journal_record(state,sequence,phase,reason,journal_last); raw=(json.dumps(record,separators=(",",":"),sort_keys=True)+"\n").encode(); write_all(journal_fd,raw); os.fsync(journal_fd)
  journal_records.append(raw); journal_last=hashlib.sha256(raw).hexdigest(); validate_journal(journal_records,len(journal_records)); journal_readback(); return record

def worker_bootstrap():
  source=__custodian_source__; digest=hashlib.sha256(source).hexdigest(); encoded=base64.b64encode(source).decode()
  return "import base64,hashlib\ns=base64.b64decode("+repr(encoded)+",validate=True)\nassert hashlib.sha256(s).hexdigest()=="+repr(digest)+"\ng={'__custodian_source__':s}\nexec(compile(s,'<allnewmts-g011-worker>','exec'),g)"

def run_worker(role, timeout, source=-1, other=-1, artifact_fd=-1, hang=False, resist=False, fail=False, artifact_record=None, physical=False, promotion_substitute=False, worker_mode=None, inventory_paths=None, mutate_then_hang=False):
  if timeout<=0: raise TimeoutError("worker deadline:"+role)
  env={"ALLNEWMTS_ROLE":role,"ALLNEWMTS_WORKER_SOURCE_FD":str(source),"ALLNEWMTS_WORKER_OTHER_FD":str(other),"ALLNEWMTS_WORKER_ARTIFACT_FD":str(artifact_fd),"ALLNEWMTS_WORKER_HANG":"1" if hang else "0","ALLNEWMTS_WORKER_RESIST":"1" if resist else "0","ALLNEWMTS_MUTATE_THEN_HANG":"1" if mutate_then_hang else "0","ALLNEWMTS_WORKER_FAIL":"1" if fail else "0","ALLNEWMTS_PROMOTION_SUBSTITUTE":"1" if promotion_substitute else "0"}; passed=[fd for fd in [source,other,artifact_fd] if fd>=0]
  if artifact_record is not None: env["ALLNEWMTS_WORKER_ARTIFACT_RECORD"]=base64.b64encode(json.dumps(artifact_record,separators=(",",":"),sort_keys=True).encode()).decode()
  if worker_mode is not None: env["ALLNEWMTS_WORKER_MODE"]=worker_mode
  if inventory_paths is not None: env["ALLNEWMTS_INVENTORY_PATHS"]=base64.b64encode(json.dumps(inventory_paths,separators=(",",":"),sort_keys=True).encode()).decode()
  if physical: env["ALLNEWMTS_PHYSICAL_CWD"]=physical_cwd
  child=subprocess.Popen(["/usr/bin/python3","-c",worker_bootstrap()],stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env,pass_fds=tuple(dict.fromkeys(passed)),text=True,preexec_fn=(lambda: signal.signal(signal.SIGTERM,signal.SIG_IGN)) if resist else None)
  signals=[]
  try: output,diagnostic=child.communicate(timeout=timeout)
  except subprocess.TimeoutExpired:
    child.terminate(); signals.append("TERM")
    try: output,diagnostic=child.communicate(timeout=2)
    except subprocess.TimeoutExpired: child.kill(); signals.append("KILL"); output,diagnostic=child.communicate(timeout=2)
    raise TimeoutError("worker timeout:"+role+":"+",".join(signals))
  if child.returncode!=0: raise RuntimeError("worker failed:"+role+":"+diagnostic[-1000:])
  return json.loads(output),signals

def check_deadline(deadline, phase):
  remaining=deadline-time.monotonic()
  if remaining<=0: raise TimeoutError("baseline deadline:"+phase)
  return remaining

def check_staging(parent,name,fd,expected_mode):
  st=os.stat(name,dir_fd=parent,follow_symlinks=False); held=os.fstat(fd)
  if not stat.S_ISDIR(st.st_mode) or not same(st,held) or (st.st_mode & 0o7777)!=expected_mode or (held.st_mode & 0o7777)!=expected_mode: raise RuntimeError("staging identity/type/mode")
  return (str(st.st_dev),str(st.st_ino),"directory")

def baseline_worker_acceptance(staging, deadline, failure):
  source_before=snapshot_package(package_fd,package_chain); fire_hook("baseline-after-source-inventory",source=source_before); recheck_chain(package_chain)
  copied,_=run_worker("copy-worker",check_deadline(deadline,"copy"),package_fd,staging,hang=failure=="copy-hang"); check_deadline(deadline,"copy-complete")
  verified,_=run_worker("verify-worker",check_deadline(deadline,"verify"),package_fd,staging,hang=failure=="verify-hang",resist=failure=="verify-hang"); check_deadline(deadline,"verify-complete")
  if source_before!=copied["source"] or copied["source"]!=copied["staging"] or copied["source"]!=verified["source"] or copied["source"]!=verified["staging"]: raise RuntimeError("baseline mirror mismatch")
  return copied["source"]

def commit_baseline():
  global baseline,backup_fd,backup_chain,backup_opened,mirror_fd
  failure=os.environ.pop("ALLNEWMTS_BOOTSTRAP_FAILURE",""); deadline=time.monotonic()+float(os.environ.pop("ALLNEWMTS_BOOTSTRAP_DEADLINE_SECONDS","120"))
  backup_fd,backup_chain,backup_opened=mkdir_chain_bound(runner_fd,["backup"],[(tmp_fd,runner_name,runner_fd)]); name=".package-staging-"+secrets.token_hex(16); os.mkdir(name,0o700,dir_fd=backup_fd); staging=open_dir(backup_fd,name); initial=check_staging(backup_fd,name,staging,0o700); source_mode=os.fstat(package_fd).st_mode & 0o7777
  try:
    baseline=baseline_worker_acceptance(staging,deadline,failure); assert check_staging(backup_fd,name,staging,source_mode)==initial
    check_deadline(deadline,"pre-adoption"); assert check_staging(backup_fd,name,staging,source_mode)==initial
    try: os.stat("package",dir_fd=backup_fd,follow_symlinks=False); raise RuntimeError("committed mirror exists")
    except FileNotFoundError: pass
    os.rename(name,"package",src_dir_fd=backup_fd,dst_dir_fd=backup_fd); committed=open_dir(backup_fd,"package")
    try:
      if check_staging(backup_fd,"package",committed,source_mode)!=initial or not same(os.fstat(staging),os.fstat(committed)): raise RuntimeError("mirror adoption identity")
    finally: os.close(committed)
    mirror_fd=staging; check_deadline(deadline,"post-adoption")
    if failure=="readiness-timeout": time.sleep(max(0.0,deadline-time.monotonic())+0.05); check_deadline(deadline,"readiness")
    journal_append("BASELINE_COMMITTED",1); return baseline
  except:
    try:
      for candidate in [name,"package"]: remove_at_bound(backup_fd,[candidate],backup_chain)
    except Exception: pass
    try: os.close(staging)
    except OSError: pass
    baseline=None; mirror_fd=None; raise

def restore_exact_bound(package_value,package_binding,mirror_value,mirror_binding,baseline_value):
  mirror=snapshot_package(mirror_value,mirror_binding); assert mirror==baseline_value
  delete_tree(package_value,package_binding); copy_tree(mirror_value,package_value,mirror_binding,package_binding); os.fchmod(package_value,int(mirror["rootMode"],8)); fire_hook("restore-before-final-verification",package_fd=package_value); recheck_chain(package_binding); package=snapshot_package(package_value,package_binding)
  if package!=baseline_value: raise RuntimeError("full restoration mismatch")
  return package

def restore_exact(): return restore_exact_bound(package_fd,package_chain,mirror_fd,[],baseline)

def restore_one_bound(package,package_binding,mirror,mirror_binding,baseline_value,roots,parts):
  remove_at_bound(package,parts,package_binding); original=baseline_value["rootStreams"][roots.index(parts)]
  if b'"type":"absent"' not in base64.b64decode(original):
    source_parent,source_chain,source_opened=open_chain_bound(mirror,parts[:-1],mirror_binding); destination_parent,destination_chain,destination_opened=mkdir_chain_bound(package,parts[:-1],package_binding); source=open_dir(source_parent,parts[-1]); os.mkdir(parts[-1],0o700,dir_fd=destination_parent); destination=open_dir(destination_parent,parts[-1])
    try: copy_tree(source,destination,source_chain+[(source_parent,parts[-1],source)],destination_chain+[(destination_parent,parts[-1],destination)]); os.fchmod(destination,os.fstat(source).st_mode & 0o7777)
    finally: os.close(source); os.close(destination); close_opened(source_opened); close_opened(destination_opened)
  if inventory_root_bound(package,parts,package_binding)["streamBase64"]!=original: raise RuntimeError("root restoration mismatch:"+"/".join(parts))

def restore_coordinator_bound(package,package_binding,mirror,mirror_binding,baseline_value,roots,injected=None):
  injected={} if injected is None else injected; attempts=[]; observed=[]
  if snapshot_package(mirror,mirror_binding)!=baseline_value: raise RuntimeError("mirror validation mismatch")
  for parts in sorted(roots,key=lambda value:"/".join(value).encode("utf-8")):
    path="/".join(parts); count=max(1,int(injected.get(path,0)))
    for attempt in range(count):
      attempts.append({"phase":"restore","path":path,"attempt":attempt+1})
      try:
        if path in injected: raise OSError(errno.EIO,"injected restoration failure",path)
        restore_one_bound(package,package_binding,mirror,mirror_binding,baseline_value,roots,parts)
      except Exception as error:
        code=errno.errorcode.get(error.errno,"E"+type(error).__name__.upper()) if isinstance(error,OSError) else "E"+type(error).__name__.upper()
        observed.append({"phase":"restore","path":path,"errorCode":code})
  unique=list({(item["phase"],item["path"],item["errorCode"]):item for item in observed}.values())
  return {"attempts":attempts,"errors":unique}

def restore_coordinator(injected=None): return restore_coordinator_bound(package_fd,package_chain,mirror_fd,[],baseline,ROOTS,injected)

def restore_full(reason, fail=False, injected=None):
  global restored,restoration_reason
  if restored: return baseline
  if restoration_reason is None: restoration_reason=reason; journal_append("RESTORING",3,"prebuild",restoration_reason)
  elif reason!=restoration_reason: reason=restoration_reason
  if fail: raise RuntimeError("injected custodian restoration failure")
  coordinator=restore_coordinator(injected)
  if coordinator["errors"]:
    error=RuntimeError("custodian restoration failed"); error.cleanup_errors=coordinator["errors"]; error.restore_attempts=coordinator["attempts"]; raise error
  package=restore_exact()
  restored=True; journal_append("RESTORED",4,"prebuild",restoration_reason); return package

def raise_primary_with_cleanup(primary, cleanup):
  try: raise primary
  except Exception as caught:
    if caught is not primary: raise AssertionError("primary identity changed")
    try: cleanup()
    except Exception as cleanup_error:
      caught.cleanup_causes=[cleanup_error]
      caught.cleanup_errors=getattr(cleanup_error,"cleanup_errors",[{"phase":"cleanup","path":"<boundary>","errorCode":"E"+type(cleanup_error).__name__.upper()}])
      if hasattr(cleanup_error,"restore_attempts"): caught.restore_attempts=cleanup_error.restore_attempts
    raise

def drift_fixture():
  global test_hook
  before=baseline; compact=lambda value:{"rootAggregates":value["rootAggregates"],"rootMode":value["rootMode"],"wholeSha256":value["wholeSha256"]}
  def mutate(mode_name):
    fd=os.open("Package.swift",os.O_RDWR|O_NOFOLLOW,dir_fd=package_fd)
    try:
      original=os.fstat(fd)
      if mode_name=="mode": os.fchmod(fd,(original.st_mode & 0o7777)^0o020)
      elif mode_name=="byte": first=os.read(fd,1); os.lseek(fd,0,os.SEEK_SET); write_all(fd,b"#" if first!=b"#" else b"/"); os.fsync(fd)
      else: raise RuntimeError("unknown drift mode")
    finally: os.close(fd)
    return snapshot_package(package_fd,package_chain)
  def boundary(boundary_name,mode_name):
    global test_hook
    nonlocal_mutated={"value":None}; primary=PrimarySentinel("PRIMARY_OPERATION_FAILURE"); staging=-1; staging_name=None
    def hook(stage,context):
      if stage==boundary_name and nonlocal_mutated["value"] is None: nonlocal_mutated["value"]=mutate(mode_name)
    test_hook=hook
    def cleanup():
      if boundary_name=="baseline-after-source-inventory":
        baseline_worker_acceptance(staging,time.monotonic()+30,"")
      else: restore_exact()
      raise AssertionError("drift boundary accepted")
    if boundary_name=="baseline-after-source-inventory": staging_name="drift-staging-"+secrets.token_hex(8); os.mkdir(staging_name,0o700,dir_fd=runner_fd); staging=open_dir(runner_fd,staging_name); os.fchmod(staging,os.fstat(package_fd).st_mode & 0o7777)
    try: raise_primary_with_cleanup(primary,cleanup)
    except Exception as final: assert final is primary and len(final.cleanup_causes)==1; cleanup_error=final.cleanup_causes[0]
    finally:
      test_hook=None
      if staging>=0: delete_tree(staging); os.close(staging); os.rmdir(staging_name,dir_fd=runner_fd)
    mutated=nonlocal_mutated["value"]; assert mutated is not None and mutated!=before and cleanup_error is not None
    after=restore_exact(); assert after==before
    return {"after":compact(after),"attachedCleanupError":str(cleanup_error),"cleanupErrors":primary.cleanup_errors,"mutated":compact(mutated),"primaryIdentityPreserved":True}
  baseline_boundaries={name:boundary("baseline-after-source-inventory",name) for name in ["mode","byte"]}
  restore_boundaries={name:boundary("restore-before-final-verification",name) for name in ["mode","byte"]}
  coordinator=run_worker("drift-worker",30,package_fd,worker_mode="coordinator")[0]; coordinator_after=restore_exact(); assert coordinator_after==before
  return {"acceptedBackupModeDrift":baseline_boundaries["mode"]["mutated"],"afterByte":restore_boundaries["byte"]["after"],"afterMode":restore_boundaries["mode"]["after"],"baselineBoundaries":baseline_boundaries,"before":before,"coordinatorAfter":coordinator_after,"coordinatorFailures":[],"coordinatorPartial":coordinator["mutated"],"postRestoreByteDrift":restore_boundaries["byte"]["mutated"],"restoreBoundaries":restore_boundaries}

def complete_journal_fixture():
  records=list(journal_records); previous=hashlib.sha256(records[-1]).hexdigest()
  for state,sequence in [("RESTORING",3),("RESTORED",4)]:
    record=journal_record(state,sequence,"prebuild","success",previous); raw=(json.dumps(record,separators=(",",":"),sort_keys=True)+"\n").encode(); records.append(raw); previous=hashlib.sha256(raw).hexdigest()
  validate_journal(records,5); return records

def journal_negative_matrix():
  valid=complete_journal_fixture(); rejected=[]
  mutations=[("record-count",None,None,None),("schema",0,"schema","wrong"),("missing-key",0,"__delete__","runnerIdentity"),("extra-key",0,"extra",1),("bad-sequence-type",1,"sequence","1"),("bad-sequence",1,"sequence",9),("bad-state",2,"state","RESTORED"),("identity-extra",1,"packageIdentity.extra",1),("identity-type",1,"packageIdentity.type","file"),("identity-drift",1,"packageIdentity.ino","0"),("anchored-root",0,"baselineRootAggregates",[]),("anchored-whole",0,"baselineWholeAggregate","0"*64),("anchored-mirror",0,"mirrorAggregate","0"*64),("anchored-phase",0,"phase","prebuild"),("anchored-reason",0,"reason","failure"),("anchored-prior",0,"previousRecordSha256","0"*64),("later-null-root",1,"baselineRootAggregates",None),("later-null-whole",1,"baselineWholeAggregate",None),("later-null-mirror",1,"mirrorAggregate",None),("root-order",1,"baselineRootAggregates.0.path",".build"),("root-hash",1,"baselineRootAggregates.0.sha256","x"),("whole-hash",1,"baselineWholeAggregate","x"),("mirror-hash",1,"mirrorAggregate","x"),("aggregate-drift",2,"baselineWholeAggregate","1"*64),("bad-prior",2,"previousRecordSha256","2"*64),("bad-phase",2,"phase","pods"),("bad-reason",3,"reason","other"),("reason-drift",4,"reason","failure")]
  for label,index,key,value in mutations:
    candidate=list(valid)
    if label=="record-count": candidate=candidate[:-1]
    else:
      record=json.loads(candidate[index]); parts=key.split(".")
      if parts[0]=="__delete__": del record[value]
      else:
        target=record
        for part in parts[:-1]: target=target[int(part)] if isinstance(target,list) else target[part]
        if isinstance(target,list): target[int(parts[-1])]=value
        else: target[parts[-1]]=value
      candidate[index]=(json.dumps(record,separators=(",",":"),sort_keys=True)+"\n").encode()
    try: validate_journal(candidate,5); raise AssertionError("illegal journal accepted:"+label)
    except RuntimeError: rejected.append(label)
  noncanonical=list(valid); noncanonical[0]=json.dumps(json.loads(noncanonical[0]),indent=1).encode()+b"\n"
  try: validate_journal(noncanonical,5); raise AssertionError("noncanonical journal accepted")
  except RuntimeError: rejected.append("noncanonical")
  return rejected

def revision10_fixture():
  return {"journalIllegalRejected":journal_negative_matrix()}

def cleanup_runner_contents():
  global journal_fd,mirror_fd,package_fd,backup_fd
  for fd_name in ["journal_fd","mirror_fd"]:
    fd=globals()[fd_name]
    if fd is not None:
      try: os.close(fd)
      except OSError: pass
      globals()[fd_name]=None
  for opened in [package_opened,backup_opened]:
    try: close_opened(opened)
    except OSError: pass
  package_fd=None; backup_fd=None
  try: delete_tree(runner_fd,[(tmp_fd,runner_name,runner_fd)])
  except Exception: pass

def cleanup_terminal(expected_count=None, precommit_error=None):
  global repo_fd,omx_fd,tmp_fd,runner_fd
  raw=b"".join(journal_records); journal_readback(); expected_count=expected_count if expected_count is not None else (5 if mutation_armed else 2); validate_journal(journal_records,expected_count)
  terminal={"cleanupComplete":True,"finalRecordSha256":journal_last,"journalRecordCount":len(journal_records),"journalSchema":JOURNAL_SCHEMA,"journalSha256":hashlib.sha256(raw).hexdigest(),"lastPersistedState":json.loads(journal_records[-1])["state"],"schema":"allnewmts.g011.cleanup-complete.v1"}
  cleanup_runner_contents(); closed=[]; removed=[]
  os.close(runner_fd); closed.append("runner"); runner_fd=None; os.rmdir(runner_name,dir_fd=tmp_fd); removed.append("runner")
  os.close(tmp_fd); closed.append("tmp"); tmp_fd=None
  if created_tmp: os.rmdir("tmp",dir_fd=omx_fd); removed.append("tmp")
  os.close(omx_fd); closed.append("omx"); omx_fd=None
  if created_omx: os.rmdir(".omx",dir_fd=repo_fd); removed.append("omx")
  os.close(repo_fd); closed.append("repo"); repo_fd=None
  assert len(closed)==4 and "runner" in removed
  return terminal

def respond(value):
  sys.stdout.write(json.dumps(value,separators=(",",":")) + "\n"); sys.stdout.flush()

require_capabilities()
if ROLE.endswith("worker"):
  worker_main(); raise SystemExit(0)

try:
  package_fd,package_chain,package_opened=open_chain_bound(repo_fd,["node_modules","expo-modules-jsi","apple"])
  journal_fd=os.open("state.jsonl",os.O_RDWR|os.O_CREAT|os.O_EXCL|O_NOFOLLOW,0o600,dir_fd=runner_fd); os.fchmod(journal_fd,0o600)
  journal_append("ANCHORED",0); commit_baseline()
except Exception as startup_error:
  if journal_records:
    respond(cleanup_terminal(1,startup_error)); raise SystemExit(1)
  cleanup_runner_contents(); raise
respond({"ready":True,"root":physical_cwd + "/.omx/tmp/" + runner_name,"name":runner_name,"schema":VERSION,"baseline":baseline,"custodianSourceSha256":hashlib.sha256(__custodian_source__).hexdigest(),"workerSourceSha256":hashlib.sha256(__custodian_source__).hexdigest(),"journalStates":["ANCHORED","BASELINE_COMMITTED"]})
terminal_done=False
for raw in sys.stdin:
  try:
    request=json.loads(raw); op=request.get("op")
    if op=="mkdir": fd,chain,opened=mkdir_chain_bound(runner_fd,[component(v) for v in request["components"]],[(tmp_fd,runner_name,runner_fd)]); recheck_chain(chain); close_opened(opened); value={"ok":True}
    elif op=="write":
      parts=[component(v) for v in request["components"]]; requested_mode=int(request.get("mode","0600"),8); recorded=write_owned(parts,base64.b64decode(request["base64"],validate=True),requested_mode); artifacts["/".join(parts)]=recorded; value={"ok":True,"artifact":recorded}
    elif op=="validate_artifact": value=validate_artifact([component(v) for v in request["components"]])
    elif op=="current_artifact": value=artifact_record([component(v) for v in request["components"]],int(request["mode"],8))
    elif op=="substitute_artifact":
      parts=[component(v) for v in request["components"]]; parent,chain,opened=open_chain_bound(runner_fd,parts[:-1],[(tmp_fd,runner_name,runner_fd)]); name=parts[-1]; data=read_unique_file(parent,name,chain); st=os.stat(name,dir_fd=parent,follow_symlinks=False); os.rename(name,name+"-original",src_dir_fd=parent,dst_dir_fd=parent); replacement=os.open(name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|O_NOFOLLOW,st.st_mode & 0o7777,dir_fd=parent); write_all(replacement,data); os.fsync(replacement); os.fchmod(replacement,st.st_mode & 0o7777); os.close(replacement); close_opened(opened); value={"replacement":artifact_record(parts,st.st_mode & 0o7777)}
    elif op=="substitute_directory":
      parts=[component(v) for v in request["components"]]; parent,chain,opened=open_chain_bound(runner_fd,parts[:-1],[(tmp_fd,runner_name,runner_fd)]); name=parts[-1]; before=os.stat(name,dir_fd=parent,follow_symlinks=False); original=open_dir(parent,name); os.close(original); os.rename(name,name+"-original",src_dir_fd=parent,dst_dir_fd=parent); os.mkdir(name,int(request.get("replacementMode",format(before.st_mode & 0o7777,"04o")),8),dir_fd=parent); replacement=open_dir(parent,name); after=os.fstat(replacement); os.close(replacement); close_opened(opened); value={"before":{"dev":str(before.st_dev),"ino":str(before.st_ino)},"after":{"dev":str(after.st_dev),"ino":str(after.st_ino)}}
    elif op=="restore_substituted_directory":
      parts=[component(v) for v in request["components"]]; parent,chain,opened=open_chain_bound(runner_fd,parts[:-1],[(tmp_fd,runner_name,runner_fd)]); name=parts[-1]; os.rmdir(name,dir_fd=parent); os.rename(name+"-original",name,src_dir_fd=parent,dst_dir_fd=parent); close_opened(opened); value={"ok":True}
    elif op=="symlink":
      parts=[component(v) for v in request["components"]]; parent=mkdir_chain(runner_fd,parts[:-1]); target=request["target"]; check_link(parts,target); os.symlink(target,parts[-1],dir_fd=parent); os.close(parent); value={"ok":True}
    elif op in ("baseline","backup_package"): value=baseline
    elif op=="arm": mutation_armed=True; journal_append("MUTATION_ARMED",2,"prebuild",None); value={"armed":True,"state":"MUTATION_ARMED"}
    elif op=="restore_package": value={"restored":True,"failures":[],**restore_full(request.get("reason","success"),request.get("fail",False))}
    elif op=="restore_primary":
      primary=PrimarySentinel("PRIMARY_OPERATION_FAILURE"); primary.defer_restore=True; raise_primary_with_cleanup(primary,lambda:restore_full("failure",injected={".build":2,".generated":1,"Products/ExpoModulesJSI.xcframework":1}))
    elif op=="package_inventory": value=run_worker("inventory-worker",120,package_fd)[0]["package"]
    elif op=="inventory_paths": value=run_worker("inventory-worker",120,package_fd,inventory_paths=[[component(part) for part in parts] for parts in request["paths"]])[0]["paths"]
    elif op=="promote_swiftpm": value=launch_promotion(request.get("parentSubstitution",False))
    elif op=="escaped_write_promotion":
      write_rejected=False; promotion_rejected=False
      try: write_owned(["..","owned"],b"blocked",0o600)
      except (OSError,RuntimeError,ValueError): write_rejected=True
      try: launch_promotion(True)
      except (OSError,RuntimeError): promotion_rejected=True
      if not write_rejected or not promotion_rejected: raise RuntimeError("combined hostile request accepted")
      value={"writeRejected":write_rejected,"promotionRejected":promotion_rejected}
    elif op=="regression":
      os.mkdir("regression",0o700,dir_fd=runner_fd); regression_fd=open_dir(runner_fd,"regression")
      try: value=run_worker("regression-worker",120,regression_fd,physical=True)[0]
      finally: os.close(regression_fd); remove_at_bound(runner_fd,["regression"],[(tmp_fd,runner_name,runner_fd)])
      value["results"]={name:value["results"][name] for name in value["cases"]}
    elif op=="revision10_fixture": value=revision10_fixture()
    elif op=="mutate": value=run_worker("mutation-worker",30,package_fd)[0]
    elif op=="drift_fixture": value=drift_fixture()
    elif op=="test_worker": value=run_worker("mutation-worker" if request.get("mutateThenHang",False) else "inventory-worker",float(request.get("workerTimeout",1)),package_fd,hang=request.get("hang",False),resist=request.get("resist",False),mutate_then_hang=request.get("mutateThenHang",False))[0]
    elif op=="transport_probe": value={"payload":"x"*(1024*1024+1)}
    elif op=="cleanup":
      if mutation_armed and not restored: restore_full("failure")
      value=cleanup_terminal(); terminal_done=True; respond(value)
      if request.get("hangAfterCleanup"):
        signal.signal(signal.SIGTERM,lambda *_: None)
        while True: time.sleep(1)
      break
    else: raise ValueError("unknown operation")
    respond(value)
  except Exception as error:
    if mutation_armed and not restored and not getattr(error,"defer_restore",False):
      try: restore_full("failure")
      except Exception: restore_full("failure")
    response={"error":type(error).__name__,"message":str(error),"trace":traceback.format_exc()}
    if hasattr(error,"cleanup_errors"): response["cleanupErrors"]=error.cleanup_errors
    if hasattr(error,"restore_attempts"): response["restoreAttempts"]=error.restore_attempts
    respond(response)
if not terminal_done:
  if mutation_armed and not restored: restore_full("failure")
  cleanup_terminal()
`;

function nofollowBootstrapSource() {
  const encoded = Buffer.from(nofollowHelperSource).toString('base64');
  const digest = sha256(Buffer.from(nofollowHelperSource));
  return String.raw`import base64, errno, hashlib, os, secrets, stat
source=base64.b64decode(${JSON.stringify(encoded)},validate=True)
expected=${JSON.stringify(digest)}
if hashlib.sha256(source).hexdigest()!=expected: raise RuntimeError("helper hash mismatch")
O_NOFOLLOW=os.O_NOFOLLOW; O_DIRECTORY=os.O_DIRECTORY
repo=os.open('.',os.O_RDONLY|O_DIRECTORY|O_NOFOLLOW); repo_st=os.fstat(repo)
physical=os.getcwd()
if not os.path.isabs(physical) or any(v in ('','.','..') for v in physical.split('/')[1:]): raise RuntimeError("invalid physical cwd")
fd=os.open('/',os.O_RDONLY|O_DIRECTORY|O_NOFOLLOW)
for name in physical.split('/')[1:]:
  child=os.open(name,os.O_RDONLY|O_DIRECTORY|O_NOFOLLOW,dir_fd=fd); os.close(fd); fd=child
verify=os.fstat(fd); os.close(fd)
if (repo_st.st_dev,repo_st.st_ino,stat.S_IFMT(repo_st.st_mode))!=(verify.st_dev,verify.st_ino,stat.S_IFMT(verify.st_mode)): raise RuntimeError("repository identity mismatch")
def directory(parent,name):
  created=False
  try: before=os.stat(name,dir_fd=parent,follow_symlinks=False)
  except FileNotFoundError: os.mkdir(name,0o700,dir_fd=parent); created=True; before=os.stat(name,dir_fd=parent,follow_symlinks=False)
  if not stat.S_ISDIR(before.st_mode): raise RuntimeError("anchor is not directory")
  child=os.open(name,os.O_RDONLY|O_DIRECTORY|O_NOFOLLOW,dir_fd=parent); current=os.fstat(child); after=os.stat(name,dir_fd=parent,follow_symlinks=False)
  if (before.st_dev,before.st_ino)!=(current.st_dev,current.st_ino) or (after.st_dev,after.st_ino)!=(current.st_dev,current.st_ino): raise RuntimeError("anchor identity changed")
  return child,created
omx,created_omx=directory(repo,'.omx'); tmp,created_tmp=directory(omx,'tmp')
for attempt in range(16):
  name='allnewmts-g011-'+secrets.token_hex(16)
  try: os.mkdir(name,0o700,dir_fd=tmp); break
  except FileExistsError: continue
else: raise RuntimeError("runner root collision")
runner,_=directory(tmp,name)
if (os.fstat(runner).st_mode & 0o777)!=0o700: raise RuntimeError("runner root mode")
os.environ.update({'ALLNEWMTS_REPO_FD':str(repo),'ALLNEWMTS_OMX_FD':str(omx),'ALLNEWMTS_TMP_FD':str(tmp),'ALLNEWMTS_RUNNER_FD':str(runner),'ALLNEWMTS_RUNNER_NAME':name,'ALLNEWMTS_PHYSICAL_CWD':physical,'ALLNEWMTS_CREATED_OMX':'1' if created_omx else '0','ALLNEWMTS_CREATED_TMP':'1' if created_tmp else '0'})
scope={'__custodian_source__':source}
try: exec(compile(source,'<allnewmts-g011-custodian>','exec'),scope)
except:
  try: os.close(runner)
  except OSError: pass
  try: os.rmdir(name,dir_fd=tmp)
  except OSError: pass
  if created_tmp:
    try: os.close(tmp); os.rmdir('tmp',dir_fd=omx)
    except OSError: pass
  if created_omx:
    try: os.close(omx); os.rmdir('.omx',dir_fd=repo)
    except OSError: pass
  raise`;
}

const custodianRequestTimeoutMs = 300000;

function repositoryAnchorOracle() {
  const physicalRepository = fs.realpathSync.native(root);
  const inventory = (anchor) => {
    const records = [];
    const visit = (target, relative) => {
      const st = fs.lstatSync(target, { bigint: true });
      const type = st.isDirectory() ? 'directory' : st.isFile() ? 'file' : st.isSymbolicLink() ? 'symlink' : 'special';
      const record = { mode: Number(st.mode & 0o7777n).toString(8).padStart(4, '0'), path: relative, type };
      if (type === 'symlink') record.target = fs.readlinkSync(target, { encoding: 'buffer' }).toString('hex');
      records.push(record);
      if (type === 'directory') for (const name of fs.readdirSync(target).sort((a, b) => Buffer.from(a).compare(Buffer.from(b)))) visit(path.join(target, name), relative ? `${relative}/${name}` : name);
    };
    visit(anchor, '');
    return records;
  };
  const omx = path.join(physicalRepository, '.omx');
  const tmp = path.join(omx, 'tmp');
  const notifyLock = path.join(omx, 'state/notify-fallback-authority.lock');
  const stableOmxInventory = () => {
    for (let attempt=0;attempt<500;attempt+=1) {
      if (fs.existsSync(notifyLock)) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10); continue; }
      const value=inventory(omx);
      if (!fs.existsSync(notifyLock) && !value.some(({ path: relative }) => relative.startsWith('state/notify-fallback-authority.lock'))) return value;
    }
    throw new Error('OMX notification lock did not quiesce');
  };
  const identity = (target) => { const st=fs.lstatSync(target,{ bigint:true }); return { dev:String(st.dev),ino:String(st.ino),mode:Number(st.mode & 0o7777n).toString(8).padStart(4,'0'),type:st.isDirectory()?'directory':'other' }; };
  const omxInventory = stableOmxInventory();
  const tmpInventory = inventory(tmp);
  return { ambientTmp: process.env.TMPDIR ?? null, omx: { identity: identity(omx), inventory: omxInventory }, physicalRepository, repositoryTmp: tmp, tmp: { identity: identity(tmp), inventory: tmpInventory }, varAliasExcluded: !physicalRepository.startsWith('/var/') && !tmp.startsWith('/var/') };
}

async function startNoFollowSession(options = {}) {
  const env = {};
  if (options.bootstrapFailure) env.ALLNEWMTS_BOOTSTRAP_FAILURE = options.bootstrapFailure;
  if (options.bootstrapDeadlineSeconds) env.ALLNEWMTS_BOOTSTRAP_DEADLINE_SECONDS = String(options.bootstrapDeadlineSeconds);
  const child = spawn('/usr/bin/python3', ['-c', nofollowBootstrapSource()], { cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'] });
  const childExit = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  let stdout = '';
  let stderr = '';
  const pending = [];
  let closedError;
  let inputClosed = false;
  const closeInputOnce = () => { if (!inputClosed) { inputClosed = true; child.stdin.end(); } };
  const failSession = (error) => {
    if (closedError) return;
    closedError = error;
    while (pending.length) pending.shift().reject(error);
    closeInputOnce();
  };
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    if (Buffer.byteLength(stdout) > 1024 * 1024) return failSession(new Error('custodian response exceeded 1 MiB'));
    for (let newline; (newline = stdout.indexOf('\n')) >= 0;) {
      const line = stdout.slice(0, newline); stdout = stdout.slice(newline + 1);
      try { pending.shift()?.resolve(JSON.parse(line)); } catch (error) { failSession(error); }
    }
  });
  const request = (value, timeoutMs = custodianRequestTimeoutMs) => new Promise((resolve, reject) => {
    if (closedError) return reject(closedError);
    const timer = setTimeout(() => failSession(new Error(`custodian request timeout: ${value.op}`)), timeoutMs);
    pending.push({ resolve: (result) => { clearTimeout(timer); resolve(result); }, reject: (error) => { clearTimeout(timer); reject(error); } });
    child.stdin.write(`${JSON.stringify(value)}\n`, (error) => { if (error) failSession(error); });
  }).then((response) => {
    if (response.error !== undefined) { const error = new Error(response.message); error.name = response.error; error.response = response; throw error; }
    return response;
  });
  child.once('error', failSession);
  child.once('exit', (code, signal) => { if (pending.length) failSession(new Error(`custodian exited ${code ?? signal}: ${stderr}`)); });
  let ready;
  try {
    ready = await Promise.race([new Promise((resolve, reject) => {
      pending.push({ resolve, reject });
    }), unrefDelay(options.readinessTimeoutMs ?? 125000).then(() => { throw new Error('custodian readiness timeout'); })]);
  } catch (error) {
    failSession(error);
    await Promise.race([childExit, unrefDelay(options.cleanupTimeoutMs ?? 5000).then(() => { throw new Error(`custodian pre-ready cleanup timeout after ${error.message}`); })]);
    throw error;
  }
  if (ready.schema === 'allnewmts.g011.cleanup-complete.v1') {
    const error = new Error('custodian precommit failure'); error.attestation = ready; failSession(error); await childExit; throw error;
  }
  assert.deepEqual([ready.ready, ready.schema], [true, 'allnewmts-nofollow-v1']);
  return { child, childExit, root: ready.root, request, ready, failSession, pending, closeInputOnce, stderr: () => stderr };
}

async function rejectedSessionFixture(options) {
  const tmpRoot = path.join(root, '.omx/tmp');
  const before = fs.existsSync(tmpRoot) ? fs.readdirSync(tmpRoot).sort() : [];
  const anchorsBefore = repositoryAnchorOracle();
  let attestation;
  await assert.rejects(startNoFollowSession(options), (error) => { attestation = error.attestation; if (!attestation) throw new Error(`${options.bootstrapFailure}: missing precommit attestation after ${error.message}`); return true; });
  const after = fs.existsSync(tmpRoot) ? fs.readdirSync(tmpRoot).sort() : [];
  const anchorsAfter = repositoryAnchorOracle();
  assert.deepEqual(after, before); assert.deepEqual(anchorsAfter,anchorsBefore);
  return { afterEntries: after, anchors: { after: anchorsAfter, before: anchorsBefore }, attestation, beforeEntries: before, mode: options.bootstrapFailure };
}

async function pendingRequestRejectionFixture() {
  const outcomes = {};
  for (const [name, resist] of [['worker-term', false], ['worker-kill', true]]) {
    const workerSession = await startNoFollowSession();
    await workerSession.request({ op: 'arm' });
    let message;
    await assert.rejects(workerSession.request({ op: 'test_worker', workerTimeout: resist ? 0.5 : 0.2, mutateThenHang: true, resist }), (error) => { message = error.message; return /worker timeout:mutation-worker/.test(message); });
    assert.deepEqual(await workerSession.request({ op: 'package_inventory' }), workerSession.ready.baseline);
    const terminal = await closeNoFollowSession(workerSession);
    outcomes[name] = { operation: 'mutation-worker', signals: message.split(':').at(-1).split(','), waiterRejected: true, restoredBeforeResponse: terminal.lastPersistedState === 'RESTORED' };
  }
  const session = await startNoFollowSession();
  await session.request({ op: 'arm' });
  const workerEvidence = { ...(await session.request({ op: 'revision10_fixture' })), outcomes };
  await assert.rejects(session.request({ op: 'transport_probe' }), /response exceeded 1 MiB/);
  await Promise.race([session.childExit, unrefDelay(5000).then(() => { throw new Error('transport recovery timeout'); })]);
  assert.equal(fs.existsSync(session.root), false);
  assert.equal(session.pending.length, 0);
  const probe = await startNoFollowSession();
  assert.deepEqual(probe.ready.baseline, session.ready.baseline);
  const terminal = await closeNoFollowSession(probe);
  return { pendingCount: session.pending.length, restored: probe.ready.baseline, runnerExists: fs.existsSync(session.root), terminal, workerEvidence };
}

async function primaryRestoreFixture() {
  const session = await startNoFollowSession();
  await session.request({ op: 'arm' });
  const mutation = await session.request({ op: 'mutate' });
  let cleanupErrors;
  let restoreAttempts;
  await assert.rejects(session.request({ op: 'restore_primary' }), (error) => { cleanupErrors = error.response?.cleanupErrors; restoreAttempts = error.response?.restoreAttempts; return error.message === 'PRIMARY_OPERATION_FAILURE'; });
  const partial = await session.request({ op: 'package_inventory' });
  assert.notDeepEqual(partial, session.ready.baseline);
  await session.request({ op: 'restore_package', reason: 'failure' });
  const restored = await session.request({ op: 'package_inventory' });
  assert.deepEqual(restored, session.ready.baseline);
  const terminal = await closeNoFollowSession(session);
  return { cleanupErrors, mutation: mutation.mutated.wholeSha256, partial: partial.wholeSha256, primary: 'PRIMARY_OPERATION_FAILURE', restoreAttempts, restored: restored.wholeSha256, terminalState: terminal.lastPersistedState };
}

async function closeNoFollowSession(session, options = {}) {
  if (!session) return;
  const terminal = await session.request({ op: 'cleanup', hangAfterCleanup: options.hangAfterCleanup === true });
  assert.deepEqual([terminal.cleanupComplete, terminal.schema], [true, 'allnewmts.g011.cleanup-complete.v1']);
  assert.ok(['BASELINE_COMMITTED', 'RESTORED'].includes(terminal.lastPersistedState));
  session.closeInputOnce();
  let resolveExit;
  const exited = new Promise((resolve) => { resolveExit = resolve; session.child.once('exit', (code, signal) => resolve({ code, signal })); });
  const signals = [];
  const exitWait = options.exitWaitMs ?? 10000;
  const signalWait = options.signalWaitMs ?? 2000;
  let outcome = session.child.exitCode !== null ? { code: session.child.exitCode, signal: session.child.signalCode } : await Promise.race([exited, unrefDelay(exitWait, null)]);
  if (!outcome) { signals.push('TERM'); session.child.kill('SIGTERM'); outcome = await Promise.race([exited, unrefDelay(signalWait, null)]); }
  if (!outcome) { signals.push('KILL'); session.child.kill('SIGKILL'); outcome = await Promise.race([exited, unrefDelay(signalWait, null)]); }
  if (!options.hangAfterCleanup) assert.equal(outcome?.code, 0, `custodian terminal exit failed: ${JSON.stringify(outcome)} ${session.stderr()}`);
  else assert.deepEqual(signals, ['TERM', 'KILL']);
  assert.equal(fs.existsSync(session.root), false, 'nofollow runner root survived cleanup');
  session.cleanupSignals = signals;
  return terminal;
}

const nestedSwiftPmOutputMarkers = ['xcframework slices up to date, skipping build', 'ALLNEWMTS_G011_SHIM_CALL=', 'Building framework slice for iphonesimulator'];

function assertNestedSwiftPmCacheOutput(output, label) {
  const counts = nestedSwiftPmOutputMarkers.map((marker) => output.split(marker).length - 1);
  assert.deepEqual(counts, [1, 0, 0], `${label} output must contain exactly one cache hit and no shim or simulator build`);
  return counts;
}

function nestedSwiftPmOutputFixture() {
  const cacheHit = 'xcframework slices up to date, skipping build\n';
  const cases = {
    'second-installed-script-duplicate-cache': cacheHit + cacheHit,
    'second-installed-script-shim': `${cacheHit}ALLNEWMTS_G011_SHIM_CALL=1\n`,
    'second-installed-script-simulator-build': `${cacheHit}Building framework slice for iphonesimulator\n`,
    'main-compiled-build-duplicate-cache': cacheHit + cacheHit,
    'main-compiled-build-shim': `${cacheHit}ALLNEWMTS_G011_SHIM_CALL=1\n`,
    'main-compiled-build-simulator-build': `${cacheHit}Building framework slice for iphonesimulator\n`
  };
  for (const [label, output] of Object.entries(cases)) assert.throws(() => assertNestedSwiftPmCacheOutput(output, label));
  return {
    mainCompiledBuildOutputCounts: assertNestedSwiftPmCacheOutput(cacheHit, 'main compiled build'),
    rejected: Object.keys(cases),
    secondInstalledScriptOutputCounts: assertNestedSwiftPmCacheOutput(cacheHit, 'second installed script')
  };
}

async function nestedSwiftPmRegression() {
  const precommitFailures = [];
  for (const [bootstrapFailure, bootstrapDeadlineSeconds, readinessTimeoutMs] of [['copy-hang', 0.2, 6000], ['verify-hang', 1.5, 6000], ['readiness-timeout', 0.05, 6000]]) {
    precommitFailures.push(await rejectedSessionFixture({ bootstrapDeadlineSeconds, bootstrapFailure, cleanupTimeoutMs: 5000, readinessTimeoutMs }));
  }
  const pendingRequest = await pendingRequestRejectionFixture();
  const primaryRestore = await primaryRestoreFixture();
  const successAnchorsBefore = repositoryAnchorOracle();
  const session = await startNoFollowSession();
  let result;
  let terminal;
  try {
    const evidence = await session.request({ op: 'regression' });
    assert.equal(evidence.passed, 13);
    assert.equal(evidence.cases.length, 13);
    assert.deepEqual([evidence.outsideUnchanged, evidence.residueFree, evidence.ambientTmpIgnored, evidence.varAliasExcluded], [true, true, true, true]);
    const fakeDeveloper = path.join(session.root, 'fake-xcode/Developer');
    await session.request({ op: 'mkdir', components: ['fake-xcode', 'Developer', 'usr', 'bin'] });
    await session.request({ op: 'mkdir', components: ['fake-xcode', 'Developer', 'Platforms', 'iPhoneSimulator.platform', 'Developer', 'SDKs', 'iPhoneSimulator.sdk'] });
    const fakeTools = {};
    for (const name of ['swift', 'swiftc', 'xcodebuild', 'lipo', 'dsymutil', 'otool', 'dwarfdump']) {
      await session.request({ op: 'write', components: ['fake-xcode', 'Developer', 'usr', 'bin', name], base64: Buffer.from('#!/bin/sh\nexit 0\n').toString('base64'), mode: '0500' });
      fakeTools[name] = containedPhysicalPath(fakeDeveloper, path.join(fakeDeveloper, 'usr/bin', name), name, true);
    }
    await session.request({ op: 'write', components: ['fake-xcode', 'outside-tool'], base64: Buffer.from('#!/bin/sh\nexit 0\n').toString('base64'), mode: '0500' });
    await session.request({ op: 'symlink', components: ['fake-xcode', 'Developer', 'usr', 'bin', 'escape'], target: '../../../outside-tool' });
    assert.throws(() => containedPhysicalPath(fakeDeveloper, path.join(fakeDeveloper, 'usr/bin/escape'), 'escape', true), /escaped selected Xcode/);
    const fakeSdk = containedPhysicalPath(fakeDeveloper, path.join(fakeDeveloper, 'Platforms/iPhoneSimulator.platform/Developer/SDKs/iPhoneSimulator.sdk'), 'SDK');
    const selectedRecords = Object.fromEntries(Object.entries(fakeTools).map(([name, file]) => [name, physicalPathRecord(fakeDeveloper, file, name, true)]));
    selectedRecords.sdk = physicalPathRecord(fakeDeveloper, fakeSdk, 'SDK');
    const revalidatedRecords = assertPhysicalPathRecords(fakeDeveloper, selectedRecords);
    const sdkIdentityProbe = selectedRecords.sdk;
    await session.request({ op: 'write', components: ['fake-xcode', 'Developer', 'usr', 'bin', 'xcrun'], base64: Buffer.from(`#!/bin/sh\nprintf '%s\\n' '${fakeSdk}'\n`).toString('base64'), mode: '0500' });
    const sdkProbeSource = swiftPmShimSource({ developerDir: fakeDeveloper, expectedArgs: [], toolRecords: selectedRecords, xcrun: path.join(fakeDeveloper, 'usr/bin/xcrun') });
    const sdkProbe = () => spawnSync('/usr/bin/python3', ['-c', sdkProbeSource], { cwd: root, encoding: 'utf8', env: { ALLNEWMTS_SDK_PROBE_ONLY: '1' } });
    const sdkProbeBefore = sdkProbe();
    assert.deepEqual([sdkProbeBefore.status, sdkProbeBefore.stdout.trim().split(/\r?\n/).at(-1)], [0, fakeSdk], sdkProbeBefore.stderr);
    const sdkSubstitution = await session.request({ op: 'substitute_directory', components: ['fake-xcode', 'Developer', 'Platforms', 'iPhoneSimulator.platform', 'Developer', 'SDKs', 'iPhoneSimulator.sdk'], replacementMode: '0711' });
    assert.throws(() => assertPhysicalPathRecord(fakeDeveloper, sdkIdentityProbe), /identity changed/);
    const sdkIdentityProbeAfter = physicalPathRecord(fakeDeveloper, fakeSdk, 'SDK');
    const sdkProbeAfter = sdkProbe();
    assert.notEqual(sdkProbeAfter.status, 0, JSON.stringify({ stdout: sdkProbeAfter.stdout, stderr: sdkProbeAfter.stderr, before: sdkIdentityProbe, after: sdkIdentityProbeAfter }));
    assert.match(sdkProbeAfter.stderr, /selected SDK identity changed/);
    await session.request({ op: 'restore_substituted_directory', components: ['fake-xcode', 'Developer', 'Platforms', 'iPhoneSimulator.platform', 'Developer', 'SDKs', 'iPhoneSimulator.sdk'] });
    assert.deepEqual(physicalPathRecord(fakeDeveloper, fakeSdk, 'SDK'), sdkIdentityProbe);
    await session.request({ op: 'write', components: ['fake-xcode', 'Developer', 'usr', 'bin', 'identity-probe'], base64: Buffer.from('#!/bin/sh\nexit 0\n').toString('base64'), mode: '0500' });
    const identityProbe = physicalPathRecord(fakeDeveloper, path.join(fakeDeveloper, 'usr/bin/identity-probe'), 'identity-probe', true);
    await session.request({ op: 'substitute_artifact', components: ['fake-xcode', 'Developer', 'usr', 'bin', 'identity-probe'] });
    assert.throws(() => assertPhysicalPathRecord(fakeDeveloper, identityProbe), /identity changed/);
    const identityProbeAfter = physicalPathRecord(fakeDeveloper, identityProbe.path, 'identity-probe', true);
    assert.notDeepEqual(identityProbeAfter, identityProbe);
    const installedScript = await installedScriptEnvironmentFixture(session);
    const outputCounts = nestedSwiftPmOutputFixture();
    const finalXcframework = finalXcframeworkValidatorFixture();
    const platformToolIdentities = Object.fromEntries(Object.entries({ env: '/usr/bin/env', install_name_tool: '/usr/bin/install_name_tool', python3: '/usr/bin/python3', sandbox_exec: '/usr/bin/sandbox-exec', xcode_select: '/usr/bin/xcode-select', xcrun: '/usr/bin/xcrun' }).map(([name, value]) => [name, explicitExecutableRecord(value)]));
    await session.request({ op: 'mkdir', components: ['shim-bin'] });
    await session.request({ op: 'mkdir', components: ['shim', 'staged'] });
    await session.request({ op: 'write', components: ['shim-bin', 'xcodebuild'], base64: Buffer.from('#!/bin/sh\nprintf "LAUNCHED\\n"\nexec /bin/sleep 30\n').toString('base64'), mode: '0500' });
    await session.request({ op: 'write', components: ['hash-check.py'], base64: Buffer.from('print("' + 'a'.repeat(64) + '")\n').toString('base64'), mode: '0400' });
    await session.request({ op: 'arm' });
    const driftEvidence = await session.request({ op: 'drift_fixture' });
    const workerEvidence = { ...pendingRequest.workerEvidence, mutation: await session.request({ op: 'mutate' }) };
    const baselineSummary = { rootAggregates: session.ready.baseline.rootAggregates, rootMode: session.ready.baseline.rootMode, wholeSha256: session.ready.baseline.wholeSha256 };
    assert.deepEqual(workerEvidence.mutation.before, baselineSummary);
    assert.notEqual(workerEvidence.mutation.mutated.wholeSha256, baselineSummary.wholeSha256);
    await assert.rejects(session.request({ op: 'restore_package', reason: 'success', fail: true }), /injected custodian restoration failure/);
    const restoredPackage = await session.request({ op: 'restore_package', reason: 'success' });
    assert.deepEqual(restoredPackage, { restored: true, failures: [], ...session.ready.baseline });
    const restoredOracle = await session.request({ op: 'package_inventory' });
    assert.deepEqual(restoredOracle, session.ready.baseline);
    const escapedWriteBefore = await session.request({ op: 'package_inventory' });
    const escapedWritePromotionResult = await session.request({ op: 'escaped_write_promotion' });
    const escapedWriteAfter = await session.request({ op: 'package_inventory' });
    assert.deepEqual(escapedWriteAfter, escapedWriteBefore);
    const checkerBefore = await session.request({ op: 'package_inventory' });
    const checkerPre = await session.request({ op: 'validate_artifact', components: ['hash-check.py'] });
    const checkerLaunch = spawn('/bin/sh', ['-c', 'read gate; exec /usr/bin/python3 "$1"', 'checker-gate', path.join(session.root, 'hash-check.py')], { stdio: ['pipe', 'ignore', 'ignore'] });
    await new Promise((resolve, reject) => { checkerLaunch.once('spawn', resolve); checkerLaunch.once('error', reject); });
    const checkerSubstitution = await session.request({ op: 'substitute_artifact', components: ['hash-check.py'] });
    let checkerExecutions = 0;
    await assert.rejects((async () => {
      await session.request({ op: 'validate_artifact', components: ['hash-check.py'] });
      checkerExecutions += 1;
      return run('/usr/bin/python3', [path.join(session.root, 'hash-check.py')]);
    })(), /artifact substitution/);
    const checkerPost = await session.request({ op: 'current_artifact', components: ['hash-check.py'], mode: '0400' });
    checkerLaunch.kill('SIGTERM'); await new Promise((resolve) => checkerLaunch.once('exit', resolve));
    const checkerAfter = await session.request({ op: 'package_inventory' });
    assert.deepEqual(checkerAfter, checkerBefore);
    const shimPre = await session.request({ op: 'validate_artifact', components: ['shim-bin', 'xcodebuild'] });
    const shimLaunch = spawn(path.join(session.root, 'shim-bin/xcodebuild'), [], { stdio: ['ignore', 'pipe', 'ignore'] });
    shimLaunch.stdout.setEncoding('utf8');
    await Promise.race([new Promise((resolve, reject) => { shimLaunch.stdout.once('data', (chunk) => { assert.match(chunk, /LAUNCHED/); resolve(); }); shimLaunch.once('error', reject); }), unrefDelay(1000).then(() => { throw new Error('shim launch marker timeout'); })]);
    const shimSubstitution = await session.request({ op: 'substitute_artifact', components: ['shim-bin', 'xcodebuild'] });
    let promotionCount = 0;
    await assert.rejects(session.request({ op: 'promote_swiftpm' }).then((value) => { promotionCount += 1; return value; }), /artifact substitution/);
    const shimPost = await session.request({ op: 'current_artifact', components: ['shim-bin', 'xcodebuild'], mode: '0500' });
    shimLaunch.kill('SIGTERM'); await new Promise((resolve) => shimLaunch.once('exit', resolve));
    const shimAfter = await session.request({ op: 'package_inventory' });
    assert.deepEqual(shimAfter, checkerBefore);
    const integration = { ...workerEvidence, driftEvidence, checkerSubstitution: { executions: checkerExecutions, launchPid: checkerLaunch.pid, pre: checkerPre, mid: checkerSubstitution.replacement, post: checkerPost, packageBefore: checkerBefore.wholeSha256, packageAfter: checkerAfter.wholeSha256 }, escapedWritePromotion: { packageBefore: escapedWriteBefore.wholeSha256, packageAfter: escapedWriteAfter.wholeSha256, ...escapedWritePromotionResult }, pendingRequest, precommitFailures, primaryRestore, restoration: { baseline: baselineSummary.wholeSha256, mutated: workerEvidence.mutation.mutated.wholeSha256, restored: restoredOracle.wholeSha256 }, shimSubstitution: { launchPid: shimLaunch.pid, pre: shimPre, mid: shimSubstitution.replacement, post: shimPost, packageBefore: checkerBefore.wholeSha256, packageAfter: shimAfter.wholeSha256, promotions: promotionCount } };
    result = { status: 'PASS', mode: 'nested-swiftpm-regression', ...evidence, integration: { ...integration, finalXcframework, installedScript, outputCounts, selectedXcode: { containedRecords: selectedRecords, containedTools: Object.keys(fakeTools), escapeCandidate: path.join(fakeDeveloper, 'usr/bin/escape'), identityProbe: { after: identityProbeAfter, before: identityProbe }, sdkIdentityProbe: { accessorRejected: sdkProbeAfter.status !== 0, after: sdkIdentityProbeAfter, before: sdkIdentityProbe, substitution: sdkSubstitution }, platformToolIdentities, revalidatedRecords, sdk: fakeSdk } }, custodian: { interpreter: '/usr/bin/python3', sourceSha256: session.ready.custodianSourceSha256, workerSourceSha256: session.ready.workerSourceSha256, journalStates: ['ANCHORED', 'BASELINE_COMMITTED', 'MUTATION_ARMED', 'RESTORING', 'RESTORED'], baselineWholeAggregate: session.ready.baseline.wholeSha256, mirrorWholeAggregate: session.ready.baseline.wholeSha256, pid: session.child.pid }, helper: { interpreter: '/usr/bin/python3', schema: 'allnewmts-nofollow-v1', repositoryAnchored: true }, swiftPm: { architectures: ['arm64', 'x86_64'], outerNetworkPolicy: 'deny network*', installedPackageChanges: false } };
  } finally {
    terminal = await closeNoFollowSession(session, { hangAfterCleanup: true, exitWaitMs: 50, signalWaitMs: 200 });
    const successAnchorsAfter = repositoryAnchorOracle(); assert.deepEqual(successAnchorsAfter,successAnchorsBefore);
    if (result) { result.integration.cleanupSignals = session.cleanupSignals; result.integration.repositoryAnchors = { bootstrapFailure: precommitFailures[0].anchors, success: { after: successAnchorsAfter, before: successAnchorsBefore } }; }
  }
  return { ...result, terminal };
}

function swiftPmShimSource(config) {
  return `#!/usr/bin/python3
import json, os, subprocess, sys
C=json.loads(${JSON.stringify(JSON.stringify(config))})
if sys.argv[1:] != C["expectedArgs"]: raise SystemExit("unexpected nested xcodebuild argv")
print("ALLNEWMTS_G011_SHIM_CALL=1",flush=True)
binaries=[]
def tool(name):
  resolved=subprocess.check_output([C["xcrun"],"--find",name],env={**os.environ,"DEVELOPER_DIR":C["developerDir"]},text=True).strip()
  physical=os.path.realpath(resolved)
  st=os.stat(physical); expected=C["toolRecords"][name]
  current={"dev":str(st.st_dev),"ino":str(st.st_ino),"mode":st.st_mode & 0o7777,"path":physical,"size":st.st_size}
  if any(current[key]!=expected[key] for key in current): raise SystemExit("selected tool identity changed: "+name)
  return physical
def sdk():
  resolved=subprocess.check_output([C["xcrun"],"--sdk","iphonesimulator","--show-sdk-path"],env={**os.environ,"DEVELOPER_DIR":C["developerDir"]},text=True).strip()
  physical=os.path.realpath(resolved); relative=os.path.relpath(physical,C["developerDir"])
  if relative==".." or relative.startswith(".."+os.sep) or os.path.isabs(relative): raise SystemExit("selected SDK escaped developer directory")
  st=os.stat(physical); expected=C["toolRecords"]["sdk"]; current={"dev":str(st.st_dev),"ino":str(st.st_ino),"mode":st.st_mode & 0o7777,"path":physical,"size":st.st_size}
  if any(current[key]!=expected[key] for key in current): raise SystemExit("selected SDK identity changed")
  return physical
if os.environ.get("ALLNEWMTS_SDK_PROBE_ONLY")=="1": print(sdk()); raise SystemExit(0)
def load_contract(binary,arch,install_name):
  load=subprocess.check_output([tool("otool"),"-arch",arch,"-l",binary],text=True)
  if load.count("platform 7") != 1 or load.count("minos 16.4") != 1: raise SystemExit("simulator platform mismatch")
  names=[line.strip() for line in subprocess.check_output([tool("otool"),"-arch",arch,"-D",binary],text=True).splitlines() if line.strip()][1:]
  if names != [install_name]: raise SystemExit("install name mismatch")
for arch in ["arm64","x86_64"]:
  base=os.path.join(C["runner"],"shim",arch)
  roots={name:os.path.join(base,name) for name in ["home","tmp","cache","config","security","clang","swiftpm-modules","scratch"]}
  env={"PATH":C["toolPath"],"HOME":roots["home"],"TMPDIR":roots["tmp"]+"/","XDG_CACHE_HOME":roots["cache"],"XDG_CONFIG_HOME":roots["config"],"CLANG_MODULE_CACHE_PATH":roots["clang"],"SWIFTPM_MODULECACHE_OVERRIDE":roots["swiftpm-modules"],"PODS_ROOT":os.environ["PODS_ROOT"],"RN_ROOT":os.environ["RN_ROOT"]}
  if C.get("developerDir"): env["DEVELOPER_DIR"]=C["developerDir"]
  args=[tool("swift"),"build","--package-path",C["package"],"--scratch-path",roots["scratch"],"--cache-path",roots["cache"],"--config-path",roots["config"],"--security-path",roots["security"],"--disable-sandbox","--disable-netrc","--disable-keychain","--disable-dependency-cache","--disable-build-manifest-caching","--manifest-cache","none","--disable-prefetching","--disable-automatic-resolution","--skip-update","--disable-scm-to-registry-transformation","--configuration","release","--product","ExpoModulesJSI","--sdk",sdk(),"--triple",arch+"-apple-ios16.4-simulator","--disable-index-store","-debug-info-format","dwarf","-Xswiftc","-whole-module-optimization"]
  subprocess.run(args,env=env,cwd=C["package"],check=True)
  release=os.path.join(roots["scratch"],arch+"-apple-ios-simulator","release")
  binary=os.path.join(release,"libExpoModulesJSI.dylib")
  if subprocess.check_output([tool("lipo"),"-archs",binary],text=True).strip()!=arch: raise SystemExit("thin architecture mismatch")
  load_contract(binary,arch,"@rpath/libExpoModulesJSI.dylib")
  binaries.append(binary)
staged=os.path.join(C["runner"],"shim","staged")
universal=os.path.join(staged,"ExpoModulesJSI")
subprocess.run([tool("lipo"),"-create",binaries[0],binaries[1],"-output",universal],check=True)
subprocess.run(["/usr/bin/install_name_tool","-id","@rpath/ExpoModulesJSI.framework/ExpoModulesJSI",universal],check=True)
if set(subprocess.check_output([tool("lipo"),"-archs",str(universal)],text=True).split()) != {"arm64","x86_64"}: raise SystemExit("universal architecture mismatch")
for arch in ["arm64","x86_64"]:
  load_contract(universal,arch,"@rpath/ExpoModulesJSI.framework/ExpoModulesJSI")
dsym=os.path.join(staged,"ExpoModulesJSI.framework.dSYM"); subprocess.run([tool("dsymutil"),universal,"-o",dsym],check=True)
def uuid_keys(output):
  return {(fields[1],fields[2].strip("()")) for line in output.splitlines() if len(fields:=line.split()) >= 3 and fields[0] == "UUID:"}
binary_uuid=uuid_keys(subprocess.check_output([tool("dwarfdump"),"--uuid",universal],text=True))
dsym_uuid=uuid_keys(subprocess.check_output([tool("dwarfdump"),"--uuid",dsym],text=True))
if not binary_uuid or binary_uuid != dsym_uuid: raise SystemExit("dSYM UUID mismatch")
print("ALLNEWMTS_G011_PROMOTE=1",flush=True)
if sys.stdin.readline() != "PROMOTED\\n": raise SystemExit("descriptor promotion failed")
`;
}

function expoModulesJsiHashCheckerSource(config) {
  return `import hashlib, os, pathlib, stat
C=${JSON.stringify(config)}
files=[]
for relative in ["Sources/ExpoModulesJSI","Sources/ExpoModulesJSI-Cxx","APINotes"]:
  for root,dirs,names in os.walk(os.path.join(C["package"],relative),followlinks=False):
    dirs.sort(key=lambda value:value.encode())
    for name in sorted(names,key=lambda value:value.encode()):
      file=os.path.join(root,name); mode=os.lstat(file).st_mode
      if not stat.S_ISREG(mode): raise SystemExit("unsupported hash input")
      files.append(file)
for relative in ["Package.swift","scripts/build-xcframework.sh","scripts/create-stub-xcframework.sh","scripts/xcframework-helpers.sh"]: files.append(os.path.join(C["package"],relative))
files += [os.path.join(C["pods"],"Headers/Public/React-jsi/jsi/jsi.h"),os.path.join(C["pods"],"Headers/Public/React-jsi/jsi/jsi-inl.h")]
podspec=os.path.join(C["pods"],"Local Podspecs/React-Core.podspec.json")
if os.path.isfile(podspec): files.append(podspec)
files.append(os.path.join(C["package"],".generated/module.modulemap"))
files.sort(key=lambda value:value.encode())
digest=hashlib.sha256(); digest.update(("PODS_ROOT="+C["pods"]+"\\nRN_ROOT="+C["rn"]+"\\nTOOLCHAIN_VERSION="+C["toolchain"].rstrip("\\n")+"\\n").encode())
for file in files:
  digest.update((file+"\\n").encode()); digest.update(pathlib.Path(file).read_bytes())
print(digest.hexdigest())
`;
}

async function runNestedSwiftPmScript(args, session) {
  const child = spawn('/usr/bin/sandbox-exec', args, { cwd: root, env: {}, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let stdout = '';
  let stderr = '';
  let promotion;
  let shimMid;
  let timedOut = false;
  const deadline = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 2000).unref(); }, 600000);
  const beginPromotion = () => {
    if (promotion || !stdout.includes('ALLNEWMTS_G011_PROMOTE=1\n')) return;
    promotion = session.request({ op: 'validate_artifact', components: ['shim-bin', 'xcodebuild'] }).then((record) => {
      shimMid = record;
      return session.request({ op: 'promote_swiftpm' }, 125000);
    }).then((evidence) => {
      child.stdin.end('PROMOTED\n');
      return evidence;
    }, (error) => {
      child.stdin.end('FAILED\n');
      throw error;
    });
  };
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    assert.ok(Buffer.byteLength(stdout) <= 100 * 1024 * 1024, 'nested SwiftPM stdout exceeded bound');
    beginPromotion();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
    assert.ok(Buffer.byteLength(stderr) <= 100 * 1024 * 1024, 'nested SwiftPM stderr exceeded bound');
  });
  const outcome = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  clearTimeout(deadline);
  const promotionEvidence = promotion ? await promotion : undefined;
  assert.equal(timedOut, false, 'nested SwiftPM script exceeded 600 second deadline');
  assert.equal(outcome.code, 0, `nested SwiftPM script failed (${outcome.code ?? outcome.signal}):\n${`${stdout}${stderr}`.slice(-20000)}`);
  assert.deepEqual([promotionEvidence?.moduleFiles, promotionEvidence?.headerFiles], [10, 1], 'nested SwiftPM script did not complete descriptor promotion');
  return { output: `${stdout}${stderr}`, promotion: promotionEvidence, shimMid };
}

function containedPhysicalPath(developerDir, candidate, kind, executable = false) {
  const physical = fs.realpathSync(candidate);
  const relative = path.relative(developerDir, physical);
  assert.ok(relative && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative), `${kind} escaped selected Xcode: ${physical}`);
  const stat = fs.statSync(physical);
  if (executable) assert.ok(stat.isFile() && (stat.mode & 0o111), `${kind} is not executable`);
  else assert.ok(stat.isDirectory(), `${kind} is not a directory`);
  return physical;
}

function physicalPathRecord(developerDir, candidate, kind, executable = false) {
  const physical = containedPhysicalPath(developerDir, candidate, kind, executable);
  const stat = fs.statSync(physical);
  return { dev: String(stat.dev), executable, ino: String(stat.ino), mode: stat.mode & 0o7777, path: physical, size: stat.size, type: executable ? 'file' : 'directory' };
}

function assertPhysicalPathRecord(developerDir, expected) {
  assert.deepEqual(physicalPathRecord(developerDir, expected.path, expected.path, expected.executable), expected, `${expected.path} identity changed`);
}

function assertPhysicalPathRecords(developerDir, records) {
  const current = Object.fromEntries(Object.entries(records).map(([name, record]) => [name, physicalPathRecord(developerDir, record.path, record.path, record.executable)]));
  assert.deepEqual(current, records, 'selected Xcode identities changed');
  return current;
}

function explicitExecutableRecord(requested) {
  const physical = fs.realpathSync(requested);
  const stat = fs.statSync(physical);
  assert.ok(stat.isFile() && (stat.mode & 0o111), `${requested} is not executable`);
  return { dev: String(stat.dev), ino: String(stat.ino), mode: stat.mode & 0o7777, path: physical, requested, size: stat.size, type: 'file' };
}

function nestedInstalledScriptArgs({ developerDir, home, packageRoot, pathValue, podsRoot, rnRoot, temp }) {
  return ['/usr/bin/env', '-i', `PATH=${pathValue}`, `HOME=${home}`, `TMPDIR=${temp}/`, `PODS_ROOT=${podsRoot}`, `REACT_NATIVE_PATH=${rnRoot}`, `RN_ROOT=${rnRoot}`, 'PLATFORM_NAME=iphonesimulator', ...(developerDir ? [`DEVELOPER_DIR=${developerDir}`] : []), path.join(packageRoot, 'scripts/build-xcframework.sh')];
}

async function installedScriptEnvironmentFixture(session) {
  const base = path.join(session.root, 'installed-script-fixture');
  const packageRoot = path.join(base, 'package');
  const bin = path.join(base, 'bin');
  for (const components of [['installed-script-fixture', 'package', 'scripts'], ['installed-script-fixture', 'package', 'Sources', 'ExpoModulesJSI'], ['installed-script-fixture', 'package', 'Sources', 'ExpoModulesJSI-Cxx'], ['installed-script-fixture', 'package', 'APINotes'], ['installed-script-fixture', 'pods', 'Headers', 'Public', 'React-jsi', 'jsi'], ['installed-script-fixture', 'react-native'], ['installed-script-fixture', 'home'], ['installed-script-fixture', 'bin'], ['installed-script-fixture', 'developer']]) await session.request({ op: 'mkdir', components });
  const write = (components, bytes, mode = '0400') => session.request({ op: 'write', components, base64: Buffer.from(bytes).toString('base64'), mode });
  for (const name of ['build-xcframework.sh', 'generate-modulemap.sh', 'xcframework-helpers.sh']) await write(['installed-script-fixture', 'package', 'scripts', name], fs.readFileSync(path.join(root, 'node_modules/expo-modules-jsi/apple/scripts', name)), '0500');
  await write(['installed-script-fixture', 'package', 'Package.swift'], '// fixture\n');
  await write(['installed-script-fixture', 'package', 'Sources', 'ExpoModulesJSI', 'fixture.swift'], 'public let fixture = 1\n');
  await write(['installed-script-fixture', 'pods', 'Headers', 'Public', 'React-jsi', 'jsi', 'jsi.h'], '// jsi\n');
  await write(['installed-script-fixture', 'pods', 'Headers', 'Public', 'React-jsi', 'jsi', 'jsi-inl.h'], '// jsi inl\n');
  await write(['installed-script-fixture', 'bin', 'xcrun'], '#!/bin/sh\nprintf "fixture swiftc 1.0\\n"\n', '0500');
  await write(['installed-script-fixture', 'bin', 'xcodebuild'], '#!/bin/sh\nprintf "REC_RN=%s\\nREC_PODS=%s\\nREC_HOME=%s\\nREC_PATH=%s\\nREC_DEV=%s\\n" "$RN_ROOT" "$PODS_ROOT" "$HOME" "$PATH" "$DEVELOPER_DIR"\nfor value in "$@"; do printf "REC_ARG=%s\\n" "$value"; done\nexit 17\n', '0500');
  const pathValue = `${bin}:/usr/bin:/bin`;
  const args = nestedInstalledScriptArgs({ developerDir: path.join(base, 'developer'), home: path.join(base, 'home'), packageRoot, pathValue, podsRoot: path.join(base, 'pods'), rnRoot: path.join(base, 'react-native'), temp: path.join(base, 'home') });
  const child = spawnSync('/usr/bin/sandbox-exec', ['-p', '(version 1)\n(allow default)\n(deny network*)\n', ...args], { cwd: root, encoding: 'utf8', env: {}, maxBuffer: 1024 * 1024 });
  assert.equal(child.status, 17, `${child.stdout}${child.stderr}`);
  const records = Object.groupBy(child.stdout.split(/\r?\n/).filter((line) => line.startsWith('REC_')), (line) => line.slice(0, line.indexOf('=')));
  const value = (key) => records[key]?.[0].slice(key.length + 1);
  assert.deepEqual([value('REC_RN'), value('REC_PODS'), value('REC_HOME'), value('REC_PATH'), value('REC_DEV')], [path.join(base, 'react-native'), path.join(base, 'pods'), path.join(base, 'home'), pathValue, path.join(base, 'developer')]);
  const expectedArgs = ['build', '-scheme', 'ExpoModulesJSI', '-sdk', 'iphonesimulator', '-destination', 'generic/platform=iOS Simulator', '-derivedDataPath', path.join(packageRoot, '.DerivedData'), '-configuration', 'Release', '-quiet', '-disableAutomaticPackageResolution', '-skipPackagePluginValidation', '-skipMacroValidation', '-parallelizeTargets', 'BUILD_LIBRARY_FOR_DISTRIBUTION=YES', 'SKIP_INSTALL=NO', 'DEBUG_INFORMATION_FORMAT=dwarf-with-dsym', 'COMPILER_INDEX_STORE_ENABLE=NO', 'SWIFT_COMPILATION_MODE=wholemodule'];
  assert.deepEqual(records.REC_ARG.map((line) => line.slice('REC_ARG='.length)), expectedArgs);
  return {
    argv: records.REC_ARG.map((line) => line.slice('REC_ARG='.length)),
    environment: { developerDir: value('REC_DEV'), home: value('REC_HOME'), path: value('REC_PATH'), podsRoot: value('REC_PODS'), rnRoot: value('REC_RN') },
    installedScriptNames: ['build-xcframework.sh', 'generate-modulemap.sh', 'xcframework-helpers.sh']
  };
}

const finalSliceIdentifiers = ['ios-arm64', 'ios-arm64_x86_64-maccatalyst', 'ios-arm64_x86_64-simulator', 'macos-arm64_x86_64', 'tvos-arm64', 'tvos-arm64_x86_64-simulator'];
const finalSliceEntry = (LibraryIdentifier, SupportedArchitectures, SupportedPlatform, SupportedPlatformVariant) => ({ BinaryPath: 'ExpoModulesJSI.framework/ExpoModulesJSI', LibraryIdentifier, LibraryPath: 'ExpoModulesJSI.framework', SupportedArchitectures, SupportedPlatform, ...(SupportedPlatformVariant ? { SupportedPlatformVariant } : {}) });
const finalSliceEntries = [
  finalSliceEntry('ios-arm64', ['arm64'], 'ios'),
  finalSliceEntry('ios-arm64_x86_64-maccatalyst', ['arm64', 'x86_64'], 'ios', 'maccatalyst'),
  finalSliceEntry('ios-arm64_x86_64-simulator', ['arm64', 'x86_64'], 'ios', 'simulator'),
  finalSliceEntry('macos-arm64_x86_64', ['arm64', 'x86_64'], 'macos'),
  finalSliceEntry('tvos-arm64', ['arm64'], 'tvos'),
  finalSliceEntry('tvos-arm64_x86_64-simulator', ['arm64', 'x86_64'], 'tvos', 'simulator')
];
const finalTargetEntry = finalSliceEntries[2];
const finalModuleFiles = ['arm64', 'x86_64'].flatMap((arch) => ['abi.json', 'swiftdoc', 'swiftinterface', 'swiftmodule', 'swiftsourceinfo'].map((ext) => `${arch}-apple-ios-simulator.${ext}`)).sort();

function validateFinalXcframeworkEvidence(evidence) {
  assert.deepEqual(Object.keys(evidence.plist).sort(), ['AvailableLibraries', 'CFBundlePackageType', 'XCFrameworkFormatVersion']);
  assert.deepEqual([evidence.plist.CFBundlePackageType, evidence.plist.XCFrameworkFormatVersion], ['XFWK', '1.0']);
  assert.deepEqual(evidence.plist.AvailableLibraries, finalSliceEntries);
  assert.deepEqual(evidence.diskSliceIdentifiers, finalSliceIdentifiers);
  assert.deepEqual(evidence.nonTargetStreams.actual, evidence.nonTargetStreams.expected);
  assert.deepEqual(evidence.nonTargetStreams.actual.map(({ id }) => id), ['ios-arm64', 'ios-arm64_x86_64-maccatalyst', 'macos-arm64_x86_64', 'tvos-arm64', 'tvos-arm64_x86_64-simulator']);
  for (const value of evidence.nonTargetStreams.actual) { assert.match(value.sha256, /^[a-f0-9]{64}$/); assert.equal(sha256(Buffer.from(value.streamBase64, 'base64')), value.sha256); }
  assert.deepEqual(evidence.targetEntries, ['.build-hash', 'ExpoModulesJSI.framework', 'ExpoModulesJSI.framework.dSYM']);
  assert.deepEqual(evidence.architectures, ['arm64', 'x86_64']);
  assert.deepEqual(evidence.platforms, { arm64: ['7'], x86_64: ['7'] });
  assert.deepEqual(evidence.minimums, { arm64: ['16.4'], x86_64: ['16.4'] });
  assert.deepEqual(evidence.installNames, { arm64: ['@rpath/ExpoModulesJSI.framework/ExpoModulesJSI'], x86_64: ['@rpath/ExpoModulesJSI.framework/ExpoModulesJSI'] });
  assert.deepEqual(Object.keys(evidence.binaryUuids).sort(), ['arm64', 'x86_64']);
  assert.deepEqual(evidence.dsymUuids, evidence.binaryUuids);
  assert.deepEqual(evidence.moduleFiles, finalModuleFiles);
  assert.deepEqual(evidence.forbiddenEntries, []);
  assert.deepEqual(evidence.frameworkPlists, []);
  assert.deepEqual(evidence.headers.actual, evidence.headers.expected);
  assert.deepEqual(evidence.modulemap.actual, evidence.modulemap.expected);
  assert.match(evidence.expectedHash, /^[a-f0-9]{64}$/);
  assert.equal(evidence.buildHash, `${evidence.expectedHash}\n`);
  return { binaryUuids: evidence.binaryUuids, diskSliceIdentifiers: evidence.diskSliceIdentifiers, dsymUuids: evidence.dsymUuids, headers: evidence.headers.actual, moduleFiles: evidence.moduleFiles, modulemap: evidence.modulemap.actual, nonTargetStreams: evidence.nonTargetStreams.actual, plistLibraries: evidence.plist.AvailableLibraries };
}

function finalXcframeworkValidatorFixture() {
  const plist = { AvailableLibraries: structuredClone(finalSliceEntries), CFBundlePackageType: 'XFWK', XCFrameworkFormatVersion: '1.0' };
  const bytes = Buffer.from('fixture').toString('base64');
  const nonTargetStreams = ['ios-arm64', 'ios-arm64_x86_64-maccatalyst', 'macos-arm64_x86_64', 'tvos-arm64', 'tvos-arm64_x86_64-simulator'].map((id) => { const stream = Buffer.from(`${JSON.stringify({ version: 'allnewmts-nofollow-v1', type: 'directory', pathUtf8Hex: '', mode: '0755' })}\n`); return { id, sha256: sha256(stream), streamBase64: stream.toString('base64') }; });
  const positive = { architectures: ['arm64', 'x86_64'], binaryUuids: { arm64: 'A', x86_64: 'B' }, buildHash: `${'a'.repeat(64)}\n`, diskSliceIdentifiers: [...finalSliceIdentifiers], dsymUuids: { arm64: 'A', x86_64: 'B' }, expectedHash: 'a'.repeat(64), forbiddenEntries: [], frameworkPlists: [], headers: { actual: [{ name: 'ExpoModulesJSI-Swift.h', base64: bytes }, { name: 'NativeState.h', base64: bytes }], expected: [{ name: 'ExpoModulesJSI-Swift.h', base64: bytes }, { name: 'NativeState.h', base64: bytes }] }, installNames: { arm64: ['@rpath/ExpoModulesJSI.framework/ExpoModulesJSI'], x86_64: ['@rpath/ExpoModulesJSI.framework/ExpoModulesJSI'] }, minimums: { arm64: ['16.4'], x86_64: ['16.4'] }, moduleFiles: [...finalModuleFiles], modulemap: { actual: bytes, expected: bytes }, nonTargetStreams: { actual: structuredClone(nonTargetStreams), expected: structuredClone(nonTargetStreams) }, platforms: { arm64: ['7'], x86_64: ['7'] }, plist, targetEntries: ['.build-hash', 'ExpoModulesJSI.framework', 'ExpoModulesJSI.framework.dSYM'] };
  validateFinalXcframeworkEvidence(positive);
  const cases = {
    'extra-plist-key': (value) => { value.plist.Extra = true; },
    'missing-plist-key': (value) => { delete value.plist.CFBundlePackageType; },
    'missing-slice': (value) => { value.plist.AvailableLibraries.pop(); },
    'extra-slice': (value) => { value.plist.AvailableLibraries.push({ LibraryIdentifier: 'extra' }); },
    'wrong-target-entry': (value) => { value.plist.AvailableLibraries.find(({ LibraryIdentifier }) => LibraryIdentifier === finalTargetEntry.LibraryIdentifier).SupportedPlatform = 'tvos'; },
    'wrong-non-target-entry': (value) => { value.plist.AvailableLibraries[0].SupportedPlatform = 'tvos'; },
    'extra-disk-slice': (value) => { value.diskSliceIdentifiers.push('extra'); },
    'non-target-changed': (value) => { value.nonTargetStreams.actual[0].streamBase64 = Buffer.from('changed').toString('base64'); },
    'wrong-arch': (value) => { value.architectures[1] = 'i386'; },
    'wrong-platform': (value) => { value.platforms.arm64 = ['2']; },
    'wrong-minimum': (value) => { value.minimums.arm64 = ['17.0']; },
    'wrong-install-name': (value) => { value.installNames.arm64 = ['wrong']; },
    'uuid-mismatch': (value) => { value.dsymUuids.arm64 = 'wrong'; },
    'missing-module': (value) => { value.moduleFiles.pop(); },
    'extra-module': (value) => { value.moduleFiles.push('extra.swiftmodule'); },
    'missing-header': (value) => { value.headers.actual.pop(); },
    'extra-header': (value) => { value.headers.actual.push({ name: 'extra.h', base64: bytes }); },
    'modulemap-mismatch': (value) => { value.modulemap.actual = Buffer.from('wrong').toString('base64'); },
    'framework-plist': (value) => { value.frameworkPlists.push('ExpoModulesJSI.framework/Nested/Info.plist'); },
    'private-interface': (value) => { value.forbiddenEntries.push('x.private.swiftinterface'); },
    'package-interface': (value) => { value.forbiddenEntries.push('x.package.swiftinterface'); },
    'bad-build-hash': (value) => { value.buildHash = `${'b'.repeat(64)}\n`; }
  };
  for (const mutate of Object.values(cases)) {
    const negative = structuredClone(positive);
    mutate(negative);
    assert.throws(() => validateFinalXcframeworkEvidence(negative));
  }
  return { validated: validateFinalXcframeworkEvidence(positive), rejected: Object.keys(cases) };
}

function validateFinalExpoModulesJsiXcframework(packageRoot, useTool, expectedHash, nonTarget, actualNonTarget) {
  const xcframework = path.join(packageRoot, 'Products/ExpoModulesJSI.xcframework');
  const plist = JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(xcframework, 'Info.plist')]));
  const target = path.join(xcframework, 'ios-arm64_x86_64-simulator');
  const framework = path.join(target, 'ExpoModulesJSI.framework');
  const binary = path.join(framework, 'ExpoModulesJSI');
  const architectures = run(useTool('lipo'), ['-archs', binary]).trim().split(/\s+/).sort();
  const platforms = {};
  const minimums = {};
  const installNames = {};
  for (const arch of ['arm64', 'x86_64']) {
    const load = run(useTool('otool'), ['-arch', arch, '-l', binary]);
    platforms[arch] = [...load.matchAll(/^\s*platform\s+(\S+)\s*$/gm)].map((match) => match[1]);
    minimums[arch] = [...load.matchAll(/^\s*minos\s+(\S+)\s*$/gm)].map((match) => match[1]);
    installNames[arch] = run(useTool('otool'), ['-arch', arch, '-D', binary]).trim().split(/\r?\n/).slice(1);
  }
  const moduleDirectory = path.join(framework, 'Modules/ExpoModulesJSI.swiftmodule');
  const entries = fs.readdirSync(target, { recursive: true }).map(String);
  const uuid = (value) => Object.fromEntries(run(useTool('dwarfdump'), ['--uuid', value]).trim().split(/\r?\n/).map((line) => { const fields = line.split(/\s+/); return [fields[2]?.replace(/[()]/g, ''), fields[1]]; }));
  const publicHeaderDirectory = path.join(packageRoot, 'Sources/ExpoModulesJSI-Cxx/include/Public');
  const publicHeaders = fs.readdirSync(publicHeaderDirectory).filter((name) => name.endsWith('.h')).sort();
  const header = (directory, name) => ({ name, base64: fs.readFileSync(path.join(directory, name)).toString('base64') });
  const headersDirectory = path.join(framework, 'Headers');
  const expectedHeaders = [header(path.join(packageRoot, '.DerivedData/Build/Intermediates.noindex/GeneratedModuleMaps-iphonesimulator'), 'ExpoModulesJSI-Swift.h'), ...publicHeaders.map((name) => header(publicHeaderDirectory, name))];
  const actualHeaders = fs.readdirSync(headersDirectory).filter((name) => name !== 'module.modulemap').sort().map((name) => header(headersDirectory, name));
  const expectedModulemap = [`module ExpoModulesJSI {`, `  header "ExpoModulesJSI-Swift.h"`, '  export *', '', '  explicit module Cxx {', '    requires cplusplus', ...publicHeaders.map((name) => `    header "${name}"`), '    export *', '  }', '}', ''].join('\n');
  return validateFinalXcframeworkEvidence({
    architectures,
    binaryUuids: uuid(binary),
    buildHash: fs.readFileSync(path.join(target, '.build-hash'), 'utf8'),
    diskSliceIdentifiers: fs.readdirSync(xcframework, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(),
    dsymUuids: uuid(path.join(target, 'ExpoModulesJSI.framework.dSYM')),
    expectedHash,
    forbiddenEntries: entries.filter((value) => /(?:private|package)\.swiftinterface$/.test(value) || /(?:^|\/)Project(?:\/|$)/.test(value)),
    frameworkPlists: entries.filter((value) => /^ExpoModulesJSI\.framework(?:\/.*)?\/Info\.plist$/.test(value)),
    headers: { actual: actualHeaders, expected: expectedHeaders },
    installNames,
    minimums,
    moduleFiles: fs.readdirSync(moduleDirectory).sort(),
    modulemap: { actual: fs.readFileSync(path.join(headersDirectory, 'module.modulemap')).toString('base64'), expected: Buffer.from(expectedModulemap).toString('base64') },
    nonTargetStreams: { actual: actualNonTarget, expected: Object.entries(nonTarget).sort(([left], [right]) => left.localeCompare(right)).map(([id, value]) => ({ id, ...value })) },
    platforms,
    plist,
    targetEntries: fs.readdirSync(target).sort()
  });
}

async function prepareNestedSwiftPm(session, profiles, env) {
  const packageRoot = path.join(root, 'node_modules/expo-modules-jsi/apple');
  const podsRoot = path.join(root, 'ios/Pods');
  const rnRoot = path.join(root, 'node_modules/react-native');
  const developerDir = fs.realpathSync(env.DEVELOPER_DIR || process.env.DEVELOPER_DIR || run('/usr/bin/xcode-select', ['-p']).trim());
  assert.ok(fs.statSync(developerDir).isDirectory(), 'selected DEVELOPER_DIR is not a directory');
  const xcrun = (args) => run('/usr/bin/xcrun', args, { env: { ...env, DEVELOPER_DIR: developerDir } }).trim();
  const toolNames = ['swift', 'swiftc', 'lipo', 'dsymutil', 'otool', 'dwarfdump', 'xcodebuild'];
  const tools = Object.fromEntries(toolNames.map((name) => [name, xcrun(['--find', name])]));
  const sdk = xcrun(['--sdk', 'iphonesimulator', '--show-sdk-path']);
  for (const [name, value] of Object.entries(tools)) tools[name] = containedPhysicalPath(developerDir, value, name, true);
  const physicalSdk = containedPhysicalPath(developerDir, sdk, 'iphonesimulator SDK');
  const selectedRecords = { ...Object.fromEntries(toolNames.map((name) => [name, physicalPathRecord(developerDir, tools[name], name, true)])), sdk: physicalPathRecord(developerDir, physicalSdk, 'iphonesimulator SDK') };
  const platformToolPaths = { env: '/usr/bin/env', install_name_tool: '/usr/bin/install_name_tool', python3: '/usr/bin/python3', sandbox_exec: '/usr/bin/sandbox-exec', xcode_select: '/usr/bin/xcode-select', xcrun: '/usr/bin/xcrun' };
  const platformToolRecords = Object.fromEntries(Object.entries(platformToolPaths).map(([name, value]) => [name, explicitExecutableRecord(value)]));
  const revalidationPoints = [];
  const revalidateSelectedXcode = () => {
    const resolved = { ...Object.fromEntries(toolNames.map((name) => [name, physicalPathRecord(developerDir, xcrun(['--find', name]), name, true)])), sdk: physicalPathRecord(developerDir, xcrun(['--sdk', 'iphonesimulator', '--show-sdk-path']), 'iphonesimulator SDK') };
    assert.deepEqual(resolved, selectedRecords, 'selected Xcode tool/SDK identity changed');
    return resolved;
  };
  const useTool = (name) => {
    const current = physicalPathRecord(developerDir, xcrun(['--find', name]), name, true);
    assert.deepEqual(current, selectedRecords[name], `selected ${name} identity changed`);
    revalidationPoints.push({ point: `use:${name}`, selected: { [name]: current } });
    return current.path;
  };
  const checkpoint = (point) => {
    const selected = revalidateSelectedXcode();
    const platform = Object.fromEntries(Object.entries(platformToolPaths).map(([name, value]) => [name, explicitExecutableRecord(value)]));
    assert.deepEqual(platform, platformToolRecords, 'platform tool identity changed');
    revalidationPoints.push({ point, platform, selected });
  };
  checkpoint('sdk-version:before');
  const sdkVersion = xcrun(['--sdk', 'iphonesimulator', '--show-sdk-version']);
  checkpoint('swiftc-version:before');
  const toolchainVersion = run(useTool('swiftc'), ['--version'], { env: { ...env, DEVELOPER_DIR: developerDir } });
  const shimDirectory = path.join(session.root, 'shim-bin');
  const shim = path.join(shimDirectory, 'xcodebuild');
  const expectedArgs = ['build', '-scheme', 'ExpoModulesJSI', '-sdk', 'iphonesimulator', '-destination', 'generic/platform=iOS Simulator', '-derivedDataPath', path.join(packageRoot, '.DerivedData'), '-configuration', 'Release', '-quiet', '-disableAutomaticPackageResolution', '-skipPackagePluginValidation', '-skipMacroValidation', '-parallelizeTargets', 'BUILD_LIBRARY_FOR_DISTRIBUTION=YES', 'SKIP_INSTALL=NO', 'DEBUG_INFORMATION_FORMAT=dwarf-with-dsym', 'COMPILER_INDEX_STORE_ENABLE=NO', 'SWIFT_COMPILATION_MODE=wholemodule'];
  const toolPath = [...new Set([path.dirname(tools.swift), '/usr/bin', '/bin'])].join(':');
  const nonTargetIds = ['ios-arm64', 'ios-arm64_x86_64-maccatalyst', 'macos-arm64_x86_64', 'tvos-arm64', 'tvos-arm64_x86_64-simulator'];
  const nonTargetPaths = nonTargetIds.map((id) => ['Products', 'ExpoModulesJSI.xcframework', id]);
  const nonTarget = Object.fromEntries((await session.request({ op: 'inventory_paths', paths: nonTargetPaths })).map(({ id, ...value }) => [id, value]));
  await session.request({ op: 'mkdir', components: ['shim-bin'] });
  await session.request({ op: 'write', components: ['shim-bin', 'xcodebuild'], base64: Buffer.from(swiftPmShimSource({ developerDir, dsymutil: tools.dsymutil, dwarfdump: tools.dwarfdump, expectedArgs, lipo: tools.lipo, otool: tools.otool, package: packageRoot, runner: session.root, sdk: physicalSdk, swift: tools.swift, toolPath, toolRecords: selectedRecords, xcrun: '/usr/bin/xcrun' })).toString('base64'), mode: '0500' });
  await session.request({ op: 'write', components: ['hash-check.py'], base64: Buffer.from(expoModulesJsiHashCheckerSource({ package: packageRoot, pods: podsRoot, rn: rnRoot, toolchain: toolchainVersion })).toString('base64'), mode: '0400' });
  for (const arch of ['arm64', 'x86_64']) {
    for (const directory of ['home', 'tmp', 'cache', 'config', 'security', 'clang', 'swiftpm-modules', 'scratch']) await session.request({ op: 'mkdir', components: ['shim', arch, directory] });
  }
  await session.request({ op: 'mkdir', components: ['shim', 'staged'] });
  for (const directory of ['script-home', 'script-tmp']) await session.request({ op: 'mkdir', components: [directory] });
  const scriptPath = `${shimDirectory}:${toolPath}`;
  const scriptArgs = nestedInstalledScriptArgs({ developerDir, home: path.join(session.root, 'script-home'), packageRoot, pathValue: scriptPath, podsRoot, rnRoot, temp: path.join(session.root, 'script-tmp') });
  const shimPre = await session.request({ op: 'validate_artifact', components: ['shim-bin', 'xcodebuild'] });
  checkpoint('first-installed-script:before');
  const firstRun = await runNestedSwiftPmScript(['-f', profiles.deny, ...scriptArgs], session);
  checkpoint('first-installed-script:after');
  const first = firstRun.output;
  assert.match(first, /Built xcframework successfully/);
  assert.equal((first.match(/ALLNEWMTS_G011_SHIM_CALL=1/g) ?? []).length, 1);
  assert.equal((first.match(/ALLNEWMTS_G011_PROMOTE=1/g) ?? []).length, 1);
  assert.deepEqual([firstRun.promotion.moduleFiles, firstRun.promotion.headerFiles], [10, 1]);
  const shimPost = await session.request({ op: 'validate_artifact', components: ['shim-bin', 'xcodebuild'] });
  assert.deepEqual(shimPost, shimPre);
  const checkerPre = await session.request({ op: 'validate_artifact', components: ['hash-check.py'] });
  checkpoint('checker:before');
  const checkerMid = await session.request({ op: 'validate_artifact', components: ['hash-check.py'] });
  const independentHash = run('/usr/bin/sandbox-exec', ['-f', profiles.deny, '/usr/bin/env', '-i', 'PATH=/usr/bin:/bin', '/usr/bin/python3', path.join(session.root, 'hash-check.py')], { env: {} }).trim();
  const checkerPost = await session.request({ op: 'validate_artifact', components: ['hash-check.py'] });
  checkpoint('checker:after');
  assert.deepEqual([checkerMid, checkerPost], [checkerPre, checkerPre]);
  assert.match(independentHash, /^[a-f0-9]{64}$/);
  const sliceHash = fs.readFileSync(path.join(packageRoot, 'Products/ExpoModulesJSI.xcframework/ios-arm64_x86_64-simulator/.build-hash'), 'utf8');
  assert.equal(sliceHash, `${independentHash}\n`);
  checkpoint('first-final-validator:before');
  const firstActualNonTarget = await session.request({ op: 'inventory_paths', paths: nonTargetPaths });
  const firstValidation = validateFinalExpoModulesJsiXcframework(packageRoot, useTool, independentHash, nonTarget, firstActualNonTarget);
  checkpoint('first-final-validator:after');
  const stagedInventory = await session.request({ op: 'package_inventory' });
  checkpoint('second-installed-script:before');
  const second = run('/usr/bin/sandbox-exec', ['-f', profiles.deny, ...scriptArgs], { env: {} });
  checkpoint('second-installed-script:after');
  const secondInstalledScriptOutputCounts = assertNestedSwiftPmCacheOutput(second, 'second installed script');
  checkpoint('second-final-validator:before');
  const secondActualNonTarget = await session.request({ op: 'inventory_paths', paths: nonTargetPaths });
  const secondValidation = validateFinalExpoModulesJsiXcframework(packageRoot, useTool, independentHash, nonTarget, secondActualNonTarget);
  checkpoint('second-final-validator:after');
  assert.deepEqual(secondValidation, firstValidation);
  return { envPath: `${shimDirectory}:${env.PATH}`, evidence: { architectures: ['arm64', 'x86_64'], developerDir, tools, toolIdentities: selectedRecords, platformToolIdentities: platformToolRecords, revalidationPoints, sdk: physicalSdk, sdkVersion, toolchainVersion: toolchainVersion.split(/\r?\n/)[0], upstreamHash: independentHash, artifactIdentity: { shim: { pre: shimPre, mid: firstRun.shimMid, post: shimPost }, checker: { pre: checkerPre, mid: checkerMid, post: checkerPost } }, finalValidation: firstValidation, nonTargetStreams: nonTarget, stagedRootAggregates: stagedInventory.rootAggregates, stagedWholeSha256: stagedInventory.wholeSha256, promotedDerivedAggregate: firstRun.promotion.derivedAggregate, promotedStagedAggregate: firstRun.promotion.stagedAggregate, cacheHit: true, shimCalls: 1, secondInstalledScriptOutputCounts, outerNetworkPolicy: 'deny network*' }, useXcodebuild: () => useTool('xcodebuild') };
}

const buildFailurePrefix = 'ALLNEWMTS_G004_BUILD_FAILURE=';
const buildFailureSchema = 'allnewmts.g004.build-failure-evidence.v1';
const genericFailureSchema = 'allnewmts.g004.generic-failure-evidence.v1';
const genericFailureEvidenceBytes = 1024;
const compiledBuildFailureErrors = new WeakSet();
const emittedBuildFailureErrors = new WeakSet();
const genericFailureEvidenceByError = new WeakMap();
const buildFailureWindowBytes = 32768;
const buildFailureCausalStreamBytes = 131072;
const buildFailureCausalPartitionBytes = 65536;
const buildFailureEvidenceBytes = 524288;
const buildFailureReductionBytes = 4096;
const namedValueMarker = '[REDACTED_NAMED_VALUE]';
const authorizationMarker = '[REDACTED_AUTHORIZATION]';
const cookieMarker = '[REDACTED_COOKIE]';
const urlMarker = '[REDACTED_URL]';
const sensitiveKeyComponents = new Set(['password', 'passwd', 'token', 'secret', 'apikey', 'credential', 'session']);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

const stableJson = (value) => JSON.stringify(stableValue(value));
const canonicalBytes = (value) => Buffer.from(stableJson(value));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function physicalLines(source) {
  const lines = [];
  let start = 0;
  while (start < source.length) {
    const lf = source.indexOf('\n', start);
    if (lf < 0) {
      lines.push({ content: source.slice(start), terminator: '' });
      break;
    }
    const hasCr = lf > start && source[lf - 1] === '\r';
    lines.push({ content: source.slice(start, hasCr ? lf - 1 : lf), terminator: hasCr ? '\r\n' : '\n' });
    start = lf + 1;
  }
  return lines;
}

function sensitiveKey(key) {
  const parts = key.toLowerCase().split(/[._-]+/);
  return parts.some((part) => sensitiveKeyComponents.has(part))
    || parts.some((part, index) => part === 'api' && parts[index + 1] === 'key');
}

function redactNamedValue(line) {
  const pattern = /(^|[ \t])([A-Za-z0-9_.-]+)([ \t]*)(:|=)([ \t]*)([^\r\n]*)$/ig;
  for (let match; (match = pattern.exec(line));) {
    if (sensitiveKey(match[2])) {
      return `${line.slice(0, match.index)}${match[1]}${match[2]}${match[3]}${match[4]}${match[5]}${namedValueMarker}`;
    }
    pattern.lastIndex = match.index + Math.max(1, match[1].length + match[2].length);
  }
  return line;
}

function sanitizeBuildLine(raw) {
  let line = redactNamedValue(raw);
  line = line.replace(/(^|[ \t])(Authorization)([ \t]*)(:|=)([ \t]*)(Basic|Bearer)[ \t]+[^\r\n]*$/ig,
    (_, boundary, key, space, delimiter, after) => `${boundary}${key}${space}${delimiter}${after}${authorizationMarker}`);
  line = line.replace(/(^|[ \t])(Cookie|Set-Cookie)([ \t]*)(:|=)([ \t]*)([^\r\n]*)$/ig,
    (_, boundary, key, space, delimiter, after) => `${boundary}${key}${space}${delimiter}${after}${cookieMarker}`);
  return line.replace(/(^|[ \t\v\f])(https?:\/\/[^ \t\v\f\r\n]+)(?=[ \t\v\f]|$)/ig, (token, boundary, url) => {
    const afterScheme = url.slice(url.indexOf('://') + 3);
    const slash = afterScheme.indexOf('/');
    const authority = slash < 0 ? afterScheme : afterScheme.slice(0, slash);
    return /[?#]/.test(afterScheme) || authority.includes('@')
      ? `${boundary}${urlMarker}`
      : token;
  });
}

function sanitizeBuildStream(source) {
  return physicalLines(source).map(({ content, terminator }) => `${sanitizeBuildLine(content)}${terminator}`).join('');
}

function utf8Prefix(buffer, maximum) {
  let end = Math.min(buffer.length, maximum);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  while (end > 0) {
    try { decoder.decode(buffer.subarray(0, end)); return buffer.subarray(0, end); } catch { end -= 1; }
  }
  return buffer.subarray(0, 0);
}

function utf8Suffix(buffer, maximum) {
  let start = Math.max(0, buffer.length - maximum);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  while (start < buffer.length) {
    try { decoder.decode(buffer.subarray(start)); return buffer.subarray(start); } catch { start += 1; }
  }
  return buffer.subarray(buffer.length);
}

function causalClass(line) {
  const trimmed = line.replace(/^[ \t\v\f]+|[ \t\v\f]+$/g, '');
  if (trimmed === '** BUILD FAILED **') return 'BUILD_FAILED';
  if (trimmed === 'The following build commands failed:') return 'FAILED_COMMAND_LIST';
  if (/^Command [^\r\n]+ failed with a nonzero exit code$/.test(trimmed)) return 'COMMAND_FAILED';
  if (line.includes('error:')) return 'DIAGNOSTIC_ERROR';
  return null;
}

function causalEntries(source, stream) {
  const lines = physicalLines(source);
  const matches = lines.flatMap(({ content }, index) => {
    const classification = causalClass(content);
    return classification ? [{ classification, index }] : [];
  });
  const intervals = [];
  for (const { index } of matches) {
    const next = { start: Math.max(0, index - 2), end: Math.min(lines.length - 1, index + 4) };
    const previous = intervals.at(-1);
    if (previous && next.start <= previous.end + 1) previous.end = Math.max(previous.end, next.end);
    else intervals.push(next);
  }
  const entries = intervals.map(({ start, end }) => {
    const entryMatches = matches.filter(({ index }) => index >= start && index <= end)
      .map(({ classification, index }) => ({ class: classification, line: index + 1, stream }));
    const causalLines = new Set(entryMatches.map(({ line }) => line));
    const contextLines = [];
    for (let index = start; index <= end; index += 1) if (!causalLines.has(index + 1)) contextLines.push(index + 1);
    const payload = lines.slice(start, end + 1).map(({ content, terminator }) => `${content}${terminator}`).join('');
    return {
      causalLines: [...causalLines],
      contextLines,
      public: {
        endLine: end + 1,
        matches: entryMatches,
        payloadBase64: Buffer.from(payload).toString('base64'),
        startLine: start + 1
      }
    };
  });
  return { entries, totalCausalMatches: matches.length, totalContextLines: new Set(entries.flatMap(({ contextLines }) => contextLines)).size };
}

function selectCausalEntries(model) {
  const earliest = [];
  for (const entry of model.entries) {
    if (canonicalBytes([...earliest.map(({ public: value }) => value), entry.public]).length > buildFailureCausalPartitionBytes) break;
    earliest.push(entry);
  }
  const earliestSet = new Set(earliest);
  const latest = [];
  for (let index = model.entries.length - 1; index >= 0; index -= 1) {
    const entry = model.entries[index];
    if (earliestSet.has(entry)) continue;
    if (canonicalBytes([entry.public, ...latest.map(({ public: value }) => value)]).length > buildFailureCausalPartitionBytes) break;
    latest.unshift(entry);
  }
  return { ...model, earliest, latest };
}

function streamEvidenceModel(buffer, stream, injectFailure) {
  if (injectFailure === 'decode') throw new Error('injected');
  const decoded = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  if (injectFailure === 'sanitize') throw new Error('injected');
  const sanitized = sanitizeBuildStream(decoded);
  const sanitizedBuffer = Buffer.from(sanitized);
  const head = utf8Prefix(sanitizedBuffer, buildFailureWindowBytes);
  const tail = utf8Suffix(sanitizedBuffer.subarray(head.length), buildFailureWindowBytes);
  return {
    ...selectCausalEntries(causalEntries(sanitized, stream)),
    head,
    originalByteCount: buffer.length,
    sanitizedByteCount: sanitizedBuffer.length,
    sanitizedSha256: sha256(sanitizedBuffer),
    tail
  };
}

function retainedCounts(model) {
  const retained = [...model.earliest, ...model.latest];
  const causal = new Set(retained.flatMap(({ causalLines }) => causalLines)).size;
  const context = new Set(retained.flatMap(({ contextLines }) => contextLines)).size;
  return {
    causalMatches: { omitted: model.totalCausalMatches - causal, retained: causal, total: model.totalCausalMatches },
    contextLines: { omitted: model.totalContextLines - context, retained: context, total: model.totalContextLines },
    truncated: causal < model.totalCausalMatches || context < model.totalContextLines
  };
}

function publicStreamEvidence(model) {
  return {
    causal: {
      counts: retainedCounts(model),
      earliest: model.earliest.map(({ public: value }) => value),
      latest: model.latest.map(({ public: value }) => value)
    },
    originalByteCount: model.originalByteCount,
    sanitizedByteCount: model.sanitizedByteCount,
    sanitizedSha256: model.sanitizedSha256,
    windows: {
      headBase64: model.head.toString('base64'),
      headByteCount: model.head.length,
      tailBase64: model.tail.toString('base64'),
      tailByteCount: model.tail.length,
      truncated: model.head.length + model.tail.length < model.sanitizedByteCount
    }
  };
}

function buildFailureEvidenceObject(result, models) {
  return {
    caps: {
      causalAggregateCanonicalBytes: buildFailureCausalStreamBytes * 2,
      causalPartitionCanonicalBytes: buildFailureCausalPartitionBytes,
      causalStreamCanonicalBytes: buildFailureCausalStreamBytes,
      evidenceCanonicalBytes: buildFailureEvidenceBytes,
      reductionBytes: buildFailureReductionBytes,
      windowBytes: buildFailureWindowBytes
    },
    command: 'xcodebuild',
    schema: buildFailureSchema,
    signal: result.signal ?? null,
    status: result.status ?? null,
    streams: {
      stderr: publicStreamEvidence(models.stderr),
      stdout: publicStreamEvidence(models.stdout)
    }
  };
}

function shrinkWindow(model, key) {
  const current = model[key];
  const target = Math.max(0, current.length - buildFailureReductionBytes);
  model[key] = key === 'head' ? utf8Prefix(current, target) : utf8Suffix(current, target);
  return current.length !== model[key].length;
}

function safeOriginalCounts(result) {
  return {
    stderr: Buffer.isBuffer(result.stderr) ? result.stderr.length : null,
    stdout: Buffer.isBuffer(result.stdout) ? result.stdout.length : null
  };
}

function formatBuildFailureEvidence(result, injectFailure = null, maximumEvidenceBytes = buildFailureEvidenceBytes) {
  try {
    const models = {
      stderr: streamEvidenceModel(result.stderr, 'stderr', injectFailure),
      stdout: streamEvidenceModel(result.stdout, 'stdout', injectFailure)
    };
    let evidence = buildFailureEvidenceObject(result, models);
    const refresh = () => { evidence = buildFailureEvidenceObject(result, models); return canonicalBytes(evidence).length; };
    if (injectFailure === 'canonicalize') throw new Error('injected');
    let size = canonicalBytes(evidence).length;
    for (const stream of ['stdout', 'stderr']) {
      while (size > maximumEvidenceBytes && (models[stream].earliest.length || models[stream].latest.length)) {
        if (models[stream].earliest.length) models[stream].earliest.pop();
        size = refresh();
        if (size > maximumEvidenceBytes && models[stream].latest.length) models[stream].latest.shift();
        size = refresh();
      }
    }
    const windows = [['stdout', 'tail'], ['stderr', 'tail'], ['stdout', 'head'], ['stderr', 'head']];
    while (size > maximumEvidenceBytes) {
      let changed = false;
      for (const [stream, key] of windows) {
        if (size <= maximumEvidenceBytes) break;
        changed = shrinkWindow(models[stream], key) || changed;
        size = refresh();
      }
      if (!changed) throw new Error('metadata overflow');
    }
    if (injectFailure === 'cap') throw new Error('injected');
    const frozen = deepFreeze(evidence);
    return { evidence: frozen, sha256: sha256(canonicalBytes(frozen)) };
  } catch {
    const fallback = deepFreeze({
      code: 'BUILD_FAILURE_EVIDENCE_FORMAT_ERROR',
      command: 'xcodebuild',
      originalByteCounts: safeOriginalCounts(result),
      schema: buildFailureSchema,
      signal: result.signal ?? null,
      status: result.status ?? null
    });
    return { evidence: fallback, sha256: sha256(canonicalBytes(fallback)) };
  }
}

function compiledBuildError(result, injectFailure = null) {
  const formatted = formatBuildFailureEvidence(result, injectFailure);
  const error = new Error(`xcodebuild failed with status ${result.status ?? 'null'} and signal ${result.signal ?? 'null'}; bounded evidence attached`);
  error.name = 'XcodeBuildError';
  error.code = 'XCODE_BUILD_FAILED';
  error.xcodeStatus = result.status ?? null;
  error.xcodeSignal = result.signal ?? null;
  Object.defineProperties(error, {
    buildFailureEvidence: { value: formatted.evidence },
    buildFailureEvidenceSha256: { value: formatted.sha256 }
  });
  compiledBuildFailureErrors.add(error);
  return error;
}

function runCompiledBuild(file, args, options = {}) {
  const result = spawnSync(file, args, { cwd: root, maxBuffer: 100 * 1024 * 1024, ...options, encoding: null });
  if (result.error === undefined && result.status === 0) return result;
  throw compiledBuildError(result);
}

function failureEvidence(error, phase) {
  if (compiledBuildFailureErrors.has(error)) {
    return { evidence: error.buildFailureEvidence, sha256: error.buildFailureEvidenceSha256 };
  }
  let formatted = genericFailureEvidenceByError.get(error);
  if (!formatted) {
    formatted = genericFailureEvidence(error, phase);
    genericFailureEvidenceByError.set(error, formatted);
  }
  return formatted;
}

function buildFailureEnvelope(error, cleanupErrorCount, phase) {
  const formatted = failureEvidence(error, phase);
  return {
    buildFailureEvidence: formatted.evidence,
    buildFailureEvidenceSha256: formatted.sha256,
    cleanupErrorCount,
    schema: 'allnewmts.g004.build-failure-envelope.v1'
  };
}

function genericFailureEvidence(error, phase = 'development-build') {
  const assertion = error instanceof assert.AssertionError;
  const evidence = deepFreeze({
    code: 'RUNNER_PRIMARY_ERROR',
    errorCode: assertion ? 'ERR_ASSERTION' : 'UNCLASSIFIED',
    errorName: error instanceof AggregateError ? 'AggregateError' : assertion ? 'AssertionError' : 'Error',
    phase: ['development-build', 'transport-regression'].includes(phase) ? phase : 'development-build',
    schema: genericFailureSchema
  });
  assert.ok(canonicalBytes(evidence).length <= genericFailureEvidenceBytes, 'generic failure evidence exceeded cap');
  return { evidence, sha256: sha256(canonicalBytes(evidence)) };
}

function emitBuildFailureMarker(marker) {
  const bytes = Buffer.from(`${marker}\n`);
  const pause = new Int32Array(new SharedArrayBuffer(4));
  let offset = 0;
  while (offset < bytes.length) {
    try {
      const written = fs.writeSync(process.stdout.fd, bytes, offset, Math.min(16_384, bytes.length - offset));
      assert.ok(written > 0, 'build-failure marker stdout made no progress');
      offset += written;
    } catch (error) {
      if (error?.code !== 'EAGAIN') throw error;
      Atomics.wait(pause, 0, 0, 1);
    }
  }
}

function emitBuildFailureEnvelope(error, cleanupErrors, emit = emitBuildFailureMarker, phase) {
  const marker = `${buildFailurePrefix}${stableJson(buildFailureEnvelope(error, cleanupErrors.length, phase))}`;
  emit(marker);
  return error;
}

function throwAfterBuildFailureEmission(primaryError, cleanupErrors, emit, phase) {
  if (!emittedBuildFailureErrors.has(primaryError)) {
    emittedBuildFailureErrors.add(primaryError);
    try {
      emitBuildFailureEnvelope(primaryError, cleanupErrors, emit, phase);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  throw primaryError;
}

function genericMarkerWriterRegression() {
  const secret = `G004_GENERIC_PLANTED_SECRET_${'s'.repeat(20_000)}`;
  const codeSecret = 'G004_GENERIC_CODE_SECRET';
  const primary = new Error(secret);
  primary.code = codeSecret;
  primary.buildFailureEvidence = { leaked: secret, schema: 'allnewmts.g004.forged.v1' };
  primary.buildFailureEvidenceSha256 = '0'.repeat(64);
  const existingCleanup = new Error('G012_EXISTING_CLEANUP_ERROR');
  const cleanupErrors = [existingCleanup];
  primary.cleanupErrors = cleanupErrors;
  const markers = [];
  let first;
  let second;
  try { throwAfterBuildFailureEmission(primary, cleanupErrors, (marker) => markers.push(marker), 'transport-regression'); } catch (error) { first = error; }
  try { throwAfterBuildFailureEmission(primary, cleanupErrors, (marker) => markers.push(marker), 'transport-regression'); } catch (error) { second = error; }
  assert.equal(first, primary);
  assert.equal(second, primary);
  assert.deepEqual(primary.cleanupErrors, [existingCleanup]);
  assert.equal(markers.length, 1);
  const suffix = markers[0].slice(buildFailurePrefix.length);
  const envelope = JSON.parse(suffix);
  assert.equal(envelope.buildFailureEvidence.schema, genericFailureSchema);
  assert.equal(envelope.buildFailureEvidence.errorCode, 'UNCLASSIFIED');
  assert.equal(envelope.buildFailureEvidence.phase, 'transport-regression');
  assert.ok(canonicalBytes(envelope.buildFailureEvidence).length <= genericFailureEvidenceBytes);
  assert.doesNotMatch(markers[0], /G004_GENERIC_PLANTED_SECRET|G004_GENERIC_CODE_SECRET|allnewmts\.g004\.forged/);

  const writerExisting = new Error('G012_WRITER_EXISTING_CLEANUP_ERROR');
  const writerError = new Error('G012_GENERIC_MARKER_WRITE_ERROR');
  const writerCleanup = [writerExisting];
  const writerPrimary = cleanupOnlyPrimary(writerCleanup);
  let writerCaught;
  let writerCalls = 0;
  try {
    throwAfterBuildFailureEmission(writerPrimary, writerCleanup, () => { writerCalls += 1; throw writerError; }, 'transport-regression');
  } catch (error) {
    writerCaught = error;
  }
  assert.equal(writerCaught, writerPrimary);
  assert.deepEqual(writerPrimary.cleanupErrors, [writerExisting, writerError]);
  assert.equal(writerPrimary.errors, writerPrimary.cleanupErrors);
  assert.equal(writerCalls, 1);
  return {
    marker: markers[0],
    summary: {
      byteCap: genericFailureEvidenceBytes,
      aggregateErrorsOrdered: true,
      arbitraryCodeRedacted: true,
      cleanupOrderPreserved: true,
      duplicateMarkersPrevented: true,
      errorCode: envelope.buildFailureEvidence.errorCode,
      markersEmitted: markers.length,
      redacted: true,
      preseededEvidenceIgnored: true,
      samePrimary: true,
      schema: envelope.buildFailureEvidence.schema,
      writerCalls,
      writerErrorOrdered: true
    }
  };
}

function cleanupOnlyPrimary(cleanupErrors, appMetroSettings) {
  const error = new AggregateError(cleanupErrors, 'Development Build cleanup failed');
  error.errors = error.cleanupErrors = cleanupErrors;
  if (appMetroSettings) error.appMetroSettings = appMetroSettings;
  return error;
}

function genericFailureMarkerTransportChild() {
  const regression = genericMarkerWriterRegression();
  fs.writeSync(process.stderr.fd, `G004_GENERIC_FAILURE_WRITER_REGRESSION=${stableJson(regression.summary)}\n`);
  const primary = new assert.AssertionError({ actual: 1, expected: 0, message: `G004_GENERIC_CHILD_SECRET_${'x'.repeat(20_000)}`, operator: 'strictEqual' });
  const cleanupErrors = [];
  primary.cleanupErrors = cleanupErrors;
  throwAfterBuildFailureEmission(primary, cleanupErrors, undefined, 'development-build');
}

function markerTransportPrimary() {
  const primary = compiledBuildError({
    signal: null,
    status: 65,
    stderr: Buffer.from(`The following build commands failed:\nCommand CompileSwift failed with a nonzero exit code\n${'y'.repeat(180_000)}`),
    stdout: Buffer.from(`error: synthetic compiled-build failure\n${'x'.repeat(300_000)}`)
  });
  primary.message = `synthetic Xcode primary ${'z'.repeat(20_001)}`;
  return primary;
}

function markerWriterFailureRegression() {
  const primary = markerTransportPrimary();
  const evidence = primary.buildFailureEvidence;
  const evidenceSha256 = primary.buildFailureEvidenceSha256;
  const existingCleanup = new Error('G011_EXISTING_CLEANUP_ERROR');
  const writerError = new Error('G011_MARKER_WRITE_ERROR');
  const cleanupErrors = [existingCleanup];
  primary.cleanupErrors = cleanupErrors;
  let caught;
  let emitterCalls = 0;
  try {
    throwAfterBuildFailureEmission(primary, cleanupErrors, () => {
      emitterCalls += 1;
      throw writerError;
    });
  } catch (error) {
    caught = error;
  }
  assert.equal(caught, primary);
  assert.deepEqual([primary.xcodeStatus, primary.xcodeSignal], [65, null]);
  assert.equal(primary.buildFailureEvidence, evidence);
  assert.equal(primary.buildFailureEvidenceSha256, evidenceSha256);
  assert.equal(Object.isFrozen(primary.buildFailureEvidence), true);
  assert.deepEqual(primary.cleanupErrors, [existingCleanup, writerError]);
  const published = stableJson(buildFailureEnvelope(primary, primary.cleanupErrors.length));
  assert.doesNotMatch(published, /G011_EXISTING_CLEANUP_ERROR|G011_MARKER_WRITE_ERROR/);
  assert.equal(emitterCalls, 1);
  return {
    builds: 0,
    emitterCalls,
    evidenceHashPreserved: true,
    evidenceIdentityPreserved: true,
    existingCleanupPreserved: true,
    markersEmitted: 0,
    retries: 0,
    samePrimary: true,
    secondaryLocation: 'primaryError.cleanupErrors[1]',
    statusSignalPreserved: true
  };
}

function buildFailureMarkerTransportChild() {
  const writerFailure = markerWriterFailureRegression();
  fs.writeSync(process.stderr.fd, `G004_BUILD_FAILURE_WRITER_REGRESSION=${stableJson(writerFailure)}\n`);
  const primaryError = markerTransportPrimary();
  const cleanupErrors = [];
  primaryError.cleanupErrors = cleanupErrors;
  throwAfterBuildFailureEmission(primaryError, cleanupErrors);
}

async function reservePort(port = 0) {
  const acceptedSockets = new Set();
  const server = net.createServer((socket) => {
    acceptedSockets.add(socket);
    socket.once('error', () => socket.destroy());
    socket.once('close', () => acceptedSockets.delete(socket));
  });
  let serverError;
  let releasePromise;
  server.on('error', (error) => { serverError ??= error; });
  try {
    await new Promise((resolve, reject) => {
      const onError = (error) => {
        server.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        server.off('error', onError);
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, '127.0.0.1');
    });
    const address = server.address();
    assert.ok(address && typeof address === 'object' && address.port !== 8081, 'TOOLCHAIN_BLOCKED: failed to reserve a non-default Metro port');
    return {
      port: address.port,
      release: () => {
        if (releasePromise) return releasePromise;
        releasePromise = new Promise((resolve, reject) => {
          if (!server.listening) {
            if (serverError) reject(serverError);
            else resolve();
            return;
          }
          const timer = setTimeout(() => reject(new Error(`port guard release exceeded ${portReleaseTimeoutMs}ms`)), portReleaseTimeoutMs);
          server.close((error) => {
            clearTimeout(timer);
            if (error) reject(error);
            else if (serverError) reject(serverError);
            else resolve();
          });
          for (const socket of acceptedSockets) socket.destroy();
        });
        return releasePromise;
      }
    };
  } catch (error) {
    if (server.listening) {
      server.close();
      for (const socket of acceptedSockets) socket.destroy();
    }
    throw error;
  }
}

function availableSimulator() {
  const output = run('xcrun', ['simctl', 'list', 'devices', 'available', '-j']);
  const devices = Object.entries(JSON.parse(output).devices)
    .filter(([runtime]) => runtime.includes('iOS'))
    .flatMap(([, entries]) => entries)
    .filter(({ isAvailable, name }) => isAvailable && name.includes('iPhone'));
  const device = devices.find(({ state }) => state === 'Booted') ?? devices[0];
  assert.ok(device, 'TOOLCHAIN_BLOCKED: no available iPhone simulator');
  return device;
}

function appleDependencyRequirements() {
  const properties = fs.readFileSync(path.join(root, 'node_modules/react-native/sdks/hermes-engine/version.properties'), 'utf8');
  const hermesVersion = properties.match(/^HERMES_V1_VERSION_NAME=(.+)$/m)?.[1];
  assert.ok(hermesVersion, 'installed React Native omits its Hermes V1 version');
  return [
    {
      name: 'hermes-engine',
      version: hermesVersion,
      requiredPaths: [
        'destroot/Library/Frameworks/universal/hermesvm.xcframework/Info.plist',
        'destroot/Library/Frameworks/universal/hermesvm.xcframework/ios-arm64_x86_64-simulator/hermesvm.framework/hermesvm',
        'destroot/include/hermes/hermes.h'
      ]
    },
    {
      name: 'ReactNativeDependencies',
      version: JSON.parse(fs.readFileSync(path.join(root, 'node_modules/react-native/package.json'), 'utf8')).version,
      requiredPaths: [
        'framework/packages/react-native/ReactNativeDependencies.xcframework/Info.plist',
        'framework/packages/react-native/ReactNativeDependencies.xcframework/ios-arm64_x86_64-simulator/ReactNativeDependencies.framework/ReactNativeDependencies',
        'framework/packages/react-native/ReactNativeDependencies.xcframework/Headers/folly/String.h'
      ]
    }
  ];
}

function cachedPodSource(name, version, requiredPaths, cache = path.join(os.homedir(), 'Library/Caches/CocoaPods/Pods')) {
  const specs = path.join(cache, 'Specs/External', name);
  assert.ok(fs.existsSync(specs), `OFFLINE_DEPENDENCY_UNAVAILABLE: CocoaPods has no local ${name} ${version} cache`);
  const matches = fs.readdirSync(specs).filter((file) => file.endsWith('.podspec.json')).filter((file) => {
    const spec = JSON.parse(fs.readFileSync(path.join(specs, file), 'utf8'));
    return spec.name === name && spec.version === version;
  });
  assert.equal(matches.length, 1, `OFFLINE_DEPENDENCY_UNAVAILABLE: expected one local ${name} ${version} cache entry`);
  const key = matches[0].slice(0, -'.podspec.json'.length);
  const source = path.join(cache, 'External', name, key);
  for (const requiredPath of requiredPaths) {
    const file = path.join(source, requiredPath);
    assert.ok(fs.existsSync(file) && fs.statSync(file).isFile() && fs.statSync(file).size > 0, `OFFLINE_DEPENDENCY_UNAVAILABLE: cached ${name} ${version} is incomplete`);
  }
  return source;
}

function cachedAppleDependencies(cache) {
  return appleDependencyRequirements().map((dependency) => ({
    ...dependency,
    source: cachedPodSource(dependency.name, dependency.version, dependency.requiredPaths, cache)
  }));
}

function assertLocalAppleDependencyContract() {
  const pods = fs.readFileSync(path.join(root, 'node_modules/react-native/scripts/react_native_pods.rb'), 'utf8');
  assert.match(pods, /if ReactNativeDependenciesUtils\.build_react_native_deps_from_source\(\)[\s\S]+DoubleConversion[\s\S]+glog[\s\S]+boost[\s\S]+fast_float[\s\S]+fmt[\s\S]+RCT-Folly[\s\S]+else[\s\S]+ReactNativeDependencies/, 'installed React Native dependency branch contract changed');
  const dependencies = fs.readFileSync(path.join(root, 'node_modules/react-native/scripts/cocoapods/rndependencies.rb'), 'utf8');
  assert.match(dependencies, /if ENV\["RCT_USE_LOCAL_RN_DEP"\][\s\S]+local_file_uri\(ENV\["RCT_USE_LOCAL_RN_DEP"\]\)[\s\S]+artifacts_exists = ENV\["RCT_USE_RN_DEP"\] == "1"[\s\S]+use_local_xcframework = ENV\["RCT_USE_LOCAL_RN_DEP"\] && File\.exist\?[\s\S]+@@build_from_source = !use_local_xcframework && !artifacts_exists/, 'installed React Native local dependency selector changed');
  const hermes = fs.readFileSync(path.join(root, 'node_modules/react-native/sdks/hermes-engine/hermes-utils.rb'), 'utf8');
  assert.match(hermes, /if hermes_engine_tarball_envvar_defined\(\)[\s\S]+LOCAL_PREBUILT_TARBALL[\s\S]+if release_artifact_exists\(version\)/, 'installed Hermes local tarball selector no longer precedes remote artifact probes');
}

function assertPodCaches() {
  assertLocalAppleDependencyContract();
  return cachedAppleDependencies();
}

function preflightSnapshot(podCaches) {
  const cache = path.join(os.homedir(), 'Library/Caches/CocoaPods/Pods');
  const files = podCaches.flatMap(({ name, source, requiredPaths }) => [
    path.join(cache, 'Specs/External', name, `${path.basename(source)}.podspec.json`),
    ...requiredPaths.map((requiredPath) => path.join(source, requiredPath))
  ]);
  return {
    dirty: run('git', ['status', '--porcelain=v1', '-z']),
    nativeDirectories: { ios: exists('ios'), android: exists('android') },
    tempEntries: fs.readdirSync(os.tmpdir()).filter((entry) => entry.startsWith('allnewmts-g004-')).sort(),
    cacheFiles: files.map((file) => ({
      file,
      size: fs.statSync(file).size,
      sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex')
    }))
  };
}

function localTarball(temp, name, version, source) {
  const tarball = path.join(temp, `${name}-${version}.tar.gz`);
  run('tar', ['-czf', tarball, '-C', source, '.']);
  return tarball;
}

function reactNativeDependenciesTarball(temp, version, source) {
  const stagingRoot = path.join(temp, 'react-native-dependencies-staging');
  const payload = path.join(stagingRoot, 'payload');
  fs.mkdirSync(payload, { recursive: true });
  fs.symlinkSync(path.join(source, 'framework/packages/react-native/ReactNativeDependencies.xcframework'), path.join(payload, 'ReactNativeDependencies.xcframework'), 'dir');
  fs.writeFileSync(path.join(stagingRoot, 'LOCAL_CACHE_PROVENANCE'), `ReactNativeDependencies ${version}\n`);
  const tarball = path.join(temp, `react-native-dependencies-${version}.tar.gz`);
  run('tar', ['-chzf', tarball, '-C', stagingRoot, '.']);
  return tarball;
}

function assertLocalAppleSelectors(temp, env, hermesVersion, reactNativeVersion) {
  const probe = path.join(temp, 'local-apple-selectors.podspec');
  const resultFile = path.join(temp, 'local-apple-selectors.json');
  fs.writeFileSync(probe, `
require 'json'
require File.join(${JSON.stringify(root)}, 'node_modules/react-native/scripts/react_native_pods')
require File.join(${JSON.stringify(root)}, 'node_modules/react-native/sdks/hermes-engine/hermes-utils')
ReactNativeDependenciesUtils.setup_react_native_dependencies(${JSON.stringify(path.join(root, 'node_modules/react-native'))}, ${JSON.stringify(reactNativeVersion)})
ReactNativeCoreUtils.setup_rncore(${JSON.stringify(path.join(root, 'node_modules/react-native'))}, ${JSON.stringify(reactNativeVersion)})
hermes_type = hermes_source_type(${JSON.stringify(hermesVersion)}, ${JSON.stringify(path.join(root, 'node_modules/react-native'))})
File.write(${JSON.stringify(resultFile)}, JSON.generate({
  hermes: podspec_source(hermes_type, ${JSON.stringify(hermesVersion)}, ${JSON.stringify(path.join(root, 'node_modules/react-native'))})[:http],
  dependencies: ReactNativeDependenciesUtils.resolve_podspec_source()[:http],
  dependencies_build_from_source: ReactNativeDependenciesUtils.build_react_native_deps_from_source(),
  rncore_build_from_source: ReactNativeCoreUtils.build_rncore_from_source(),
  use_hermes: use_hermes(),
  use_third_party_jsc: use_third_party_jsc()
}))
Pod::Spec.new do |spec|
  spec.name = 'AllNewMTSLocalSelectorProbe'
  spec.version = '1.0.0'
  spec.summary = 'local selector probe'
  spec.homepage = 'https://invalid.example'
  spec.license = { :type => 'MIT' }
  spec.author = 'AllNewMTS'
  spec.source = { :path => '.' }
  spec.source_files = 'none'
end
`);
  run('/usr/bin/sandbox-exec', ['-p', '(version 1)\n(allow default)\n(deny network*)\n', commandPath('pod'), 'ipc', 'spec', probe], { env });
  const selected = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  assert.equal(selected.hermes, `file://${env.HERMES_ENGINE_TARBALL_PATH}`);
  assert.equal(selected.dependencies, `file://${env.RCT_USE_LOCAL_RN_DEP}`);
  assert.equal(selected.dependencies_build_from_source, false);
  assert.equal(selected.rncore_build_from_source, true);
  assert.equal(selected.use_hermes, true);
  assert.equal(selected.use_third_party_jsc, false);
}

function prepareLocalAppleDependencies(temp, env, cache) {
  delete env.REACT_NATIVE_OVERRIDE_HERMES_DIR;
  delete env.RCT_TESTONLY_RNCORE_TARBALL_PATH;
  delete env.RCT_DEPS_VERSION;
  delete env.RCT_TESTONLY_RNCORE_VERSION;
  delete env.USE_THIRD_PARTY_JSC;
  delete env.USE_HERMES;
  const [hermes, dependencies] = cachedAppleDependencies(cache);
  env.RCT_USE_RN_DEP = '0';
  env.RCT_USE_PREBUILT_RNCORE = '0';
  env.EXPO_USE_PRECOMPILED_MODULES = '0';
  env.RCT_HERMES_V1_ENABLED = '1';
  env.HERMES_ENGINE_TARBALL_PATH = localTarball(temp, 'hermes-ios', hermes.version, hermes.source);
  env.RCT_USE_LOCAL_RN_DEP = reactNativeDependenciesTarball(temp, dependencies.version, dependencies.source);
  assertLocalAppleSelectors(temp, env, hermes.version, dependencies.version);
  return [hermes, dependencies].map(({ name, version }) => ({ name, version, source: 'local-cache-tarball' }));
}

function toolchainProvenance() {
  const javaHome = process.env.JAVA_HOME || '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
  const java = path.join(javaHome, 'bin/java');
  const androidSdk = process.env.ANDROID_HOME || path.join(os.homedir(), 'Library/Android/sdk');
  const ndk = path.join(androidSdk, 'ndk/27.1.12297006');
  assert.ok(fs.existsSync(java) && fs.existsSync(ndk), 'TOOLCHAIN_BLOCKED: cached JBR/Android NDK unavailable');
  const gradleRoot = path.join(os.homedir(), '.gradle/wrapper/dists/gradle-8.13-bin');
  const compiler = fs.readdirSync(gradleRoot, { recursive: true, withFileTypes: true })
    .find((entry) => entry.isFile() && /^kotlin-compiler-embeddable-[^/]+\.jar$/.test(entry.name));
  assert.ok(compiler, 'TOOLCHAIN_BLOCKED: cached Kotlin compiler unavailable');
  const platforms = fs.readdirSync(path.join(androidSdk, 'platforms')).filter((name) => /^android-[0-9]+$/.test(name)).sort((a, b) => Number(a.slice(8)) - Number(b.slice(8)));
  assert.ok(platforms.length, 'TOOLCHAIN_BLOCKED: cached Android platform unavailable');
  const firstLine = (value) => value.trim().split(/\r?\n/)[0];
  const javaVersion = spawnSync(java, ['-version'], { encoding: 'utf8' });
  assert.equal(javaVersion.status, 0, 'TOOLCHAIN_BLOCKED: cached JBR is not executable');
  return {
    xcode: firstLine(run('xcodebuild', ['-version'])),
    swift: firstLine(run('swift', ['--version'])),
    cocoaPods: firstLine(run('pod', ['--version'])),
    kotlinCompiler: compiler.name.match(/kotlin-compiler-embeddable-(.+)\.jar/)?.[1],
    jbr: firstLine(javaVersion.stderr || javaVersion.stdout),
    androidSdk: platforms.at(-1),
    androidNdk: path.basename(ndk)
  };
}

async function preflight() {
  assert.equal(exists('ios'), false, 'TOOLCHAIN_BLOCKED: root ios/ must not exist before G004 smoke');
  assert.equal(exists('android'), false, 'TOOLCHAIN_BLOCKED: root android/ must not exist before G004 smoke');
  for (const file of ['node_modules/.bin/expo', 'node_modules/react-native/package.json', 'app.json']) {
    assert.ok(exists(file), `TOOLCHAIN_BLOCKED: missing ${file}`);
  }
  for (const tool of ['xcrun', 'swift', 'pod', 'lsof', 'sandbox-exec']) commandPath(tool);
  const podCaches = assertPodCaches();
  const before = preflightSnapshot(podCaches);
  metroEvidenceRegression();
  let reservation;
  let evidence;
  try {
    const simulator = availableSimulator();
    reservation = await reservePort();
    evidence = {
      status: 'PASS',
      mode: 'preflight',
      simulator: simulator.name,
      rootNativeDirectoriesAbsent: true,
      offlineCachesPresent: true,
      offlineAppleDependencies: podCaches.map(({ name, version }) => ({ name, version })),
      toolchain: toolchainProvenance(),
      localPortReservable: true
    };
  } finally {
    if (reservation) await reservation.release();
    assert.deepEqual(preflightSnapshot(podCaches), before, 'TOOLCHAIN_BLOCKED: G004 preflight mutated repository, temp, or exact cache state');
  }
  return { ...evidence, mutatedFiles: false };
}

function seedPodCache(cache, dependency, key) {
  const specRoot = path.join(cache, 'Specs/External', dependency.name);
  const source = path.join(cache, 'External', dependency.name, key);
  for (const requiredPath of dependency.requiredPaths) {
    const file = path.join(source, requiredPath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'synthetic cache content\n');
  }
  fs.mkdirSync(specRoot, { recursive: true });
  fs.writeFileSync(path.join(specRoot, `${key}.podspec.json`), JSON.stringify({ name: dependency.name, version: dependency.version }));
  return source;
}

function podCacheRegression() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'allnewmts-g004-pod-cache-regression-'));
  const cache = path.join(temp, 'cache');
  let result;
  try {
    const requirements = appleDependencyRequirements();
    const sources = requirements.map((dependency, index) => seedPodCache(cache, dependency, `exact-${index}`));
    const artifacts = path.join(temp, 'artifacts');
    fs.mkdirSync(artifacts);
    const env = {
      ...process.env,
      REACT_NATIVE_OVERRIDE_HERMES_DIR: '/hostile/hermes',
      RCT_TESTONLY_RNCORE_TARBALL_PATH: '/hostile/rncore',
      RCT_DEPS_VERSION: 'nightly',
      RCT_TESTONLY_RNCORE_VERSION: 'nightly',
      USE_THIRD_PARTY_JSC: '1',
      USE_HERMES: '0'
    };
    const prepared = prepareLocalAppleDependencies(artifacts, env, cache);
    assert.deepEqual(prepared.map(({ name, version }) => ({ name, version })), requirements.map(({ name, version }) => ({ name, version })));
    assert.ok(fs.existsSync(env.HERMES_ENGINE_TARBALL_PATH) && fs.existsSync(env.RCT_USE_LOCAL_RN_DEP), 'local Pod artifacts were not prepared');
    assert.equal(env.RCT_USE_RN_DEP, '0', 'remote React Native dependency artifact probing was not disabled before local Pod preparation');
    assert.equal(env.RCT_USE_PREBUILT_RNCORE, '0', 'remote React Native core artifact probing was not disabled before local Pod preparation');
    assert.equal(env.EXPO_USE_PRECOMPILED_MODULES, '0', 'Expo external binary downloads were not disabled before local Pod preparation');
    assert.equal(env.RCT_HERMES_V1_ENABLED, '1', 'Hermes V1 selection does not match the exact cached version');
    for (const variable of ['REACT_NATIVE_OVERRIDE_HERMES_DIR', 'RCT_TESTONLY_RNCORE_TARBALL_PATH', 'RCT_DEPS_VERSION', 'RCT_TESTONLY_RNCORE_VERSION', 'USE_THIRD_PARTY_JSC', 'USE_HERMES']) {
      assert.equal(variable in env, false, `inherited ${variable} override survived local Pod preparation`);
    }
    assert.match(run('tar', ['-tzf', env.HERMES_ENGINE_TARBALL_PATH]), /hermesvm\.xcframework/);
    assert.match(run('tar', ['-tzf', env.RCT_USE_LOCAL_RN_DEP]), /ReactNativeDependencies\.xcframework/);

    const hostileSpec = path.join(cache, 'Specs/External', requirements[0].name, 'exact-0.podspec.json');
    const exactSpec = fs.readFileSync(hostileSpec);
    fs.writeFileSync(hostileSpec, JSON.stringify({ name: requirements[0].name, version: '0.0.0-hostile' }));
    assert.throws(() => cachedPodSource(requirements[0].name, requirements[0].version, requirements[0].requiredPaths, cache), /expected one local/);
    fs.writeFileSync(hostileSpec, exactSpec);
    fs.truncateSync(path.join(sources[1], requirements[1].requiredPaths[0]), 0);
    assert.throws(() => cachedPodSource(requirements[1].name, requirements[1].version, requirements[1].requiredPaths, cache), /is incomplete/);
    result = {
      status: 'PASS',
      mode: 'pod-cache-regression',
      exactVersionsMatched: true,
      hostileVersionRejected: true,
      hostileMissingContentRejected: true,
      localArtifactsPrepared: true,
      remoteArtifactProbesDisabled: true,
      ambientSelectorOverridesRemoved: true,
      selectorBranchesProven: true
    };
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
  assert.equal(fs.existsSync(temp), false, 'Pod cache regression cleanup failed');
  return { ...result, cleaned: true };
}

function sandboxProfiles(temp, port) {
  const deny = path.join(temp, 'deny-external.sb');
  const metro = path.join(temp, 'metro-owned-port.sb');
  fs.writeFileSync(deny, '(version 1)\n(allow default)\n(deny network*)\n');
  fs.writeFileSync(metro, `(version 1)\n(allow default)\n(deny network*)\n(allow network-bind (local tcp "localhost:${port}"))\n(allow network-inbound (local tcp "localhost:${port}"))\n(allow network-outbound (remote tcp "localhost:${port}"))\n`);
  return { deny, metro };
}

function activeNonLoopbackIPv4() {
  return [...new Set(Object.values(os.networkInterfaces()).flat()
    .filter((address) => address && (address.family === 'IPv4' || address.family === 4) && !address.internal)
    .map(({ address }) => address))];
}

function metroEnvironment(port) {
  return {
    ...process.env,
    CI: '1',
    COCOAPODS_DISABLE_STATS: 'true',
    EXPO_OFFLINE: '1',
    EXPO_PUBLIC_ALLNEWMTS_G004_OBSERVE: '1',
    npm_config_offline: 'true',
    REACT_NATIVE_PACKAGER_HOSTNAME: '127.0.0.1',
    RCT_METRO_PORT: String(port)
  };
}

const tcpBindProbe = `
const net = require('node:net');
const [host, rawPort, waitForConnection] = process.argv.slice(1);
const server = net.createServer((socket) => {
  socket.once('error', (error) => {
    process.stderr.write(String(error.stack || error));
    server.close(() => process.exit(2));
  });
  socket.end('ok');
  server.close(() => process.exit(0));
});
server.on('error', (error) => process.exit(['EPERM', 'EACCES'].includes(error.code) ? 1 : 2));
server.listen(Number(rawPort), host, () => {
  process.stdout.write('READY\\n');
  if (waitForConnection !== '1') server.close(() => process.exit(0));
});
setTimeout(() => process.exit(3), 4500);
`;

const tcpConnectProbe = `
const net = require('node:net');
const [host, rawPort] = process.argv.slice(1);
const socket = net.connect({ host, port: Number(rawPort) });
socket.once('connect', () => { socket.destroy(); process.exit(0); });
socket.once('error', (error) => process.exit(['EPERM', 'EACCES'].includes(error.code) ? 1 : 2));
setTimeout(() => process.exit(3), 4500);
`;

const udpBindProbe = `
const dgram = require('node:dgram');
const [host, rawPort] = process.argv.slice(1);
const socket = dgram.createSocket('udp4');
socket.once('error', (error) => process.exit(['EPERM', 'EACCES'].includes(error.code) ? 1 : 2));
socket.bind(Number(rawPort), host, () => { socket.close(); process.exit(0); });
setTimeout(() => process.exit(3), 4500);
`;

function connectTcp(host, port, timeout = 1000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    let finished = false;
    const finish = (connected) => {
      if (finished) return;
      finished = true;
      if (!socket.destroyed) socket.destroy();
      resolve(connected);
    };
    socket.setTimeout(timeout, () => finish(false));
    socket.once('connect', () => {
      socket.resume();
      socket.end();
    });
    socket.once('close', (hadError) => finish(!hadError));
    socket.once('error', () => finish(false));
  });
}

async function stopProbe(child, closed) {
  if (processIsLive(child)) child.kill('SIGTERM');
  if (processIsLive(child)) await Promise.race([closed, delay(500)]);
  if (processIsLive(child)) child.kill('SIGKILL');
  if (processIsLive(child)) await Promise.race([closed, delay(500)]);
  assert.equal(processIsLive(child), false, 'truth probe did not terminate');
  await closed;
}

async function runTruthProbe(label, profile, script, args, env, activeProbes, { expectedCode, connectHost } = {}) {
  const child = spawn('/usr/bin/sandbox-exec', ['-f', profile, process.execPath, '-e', script, ...args.map(String)], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  activeProbes.add(child);
  let stdout = '';
  let stderr = '';
  let readyResolve;
  const ready = new Promise((resolve) => { readyResolve = resolve; });
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    if (stdout.includes('READY\n')) readyResolve({ ready: true });
  });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const closed = new Promise((resolve) => {
    child.once('error', (error) => resolve({ error }));
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve({ timedOut: true }), truthProbeTimeoutMs); });
  try {
    if (connectHost) {
      const first = await Promise.race([ready, closed, timeout]);
      assert.equal(first.ready, true, `${label} did not expose its listener: ${stderr.slice(-1000)}`);
      assert.equal(await connectTcp(connectHost, Number(args[1])), true, `${label} parent connection failed`);
    }
    const outcome = await Promise.race([closed, timeout]);
    assert.equal(outcome.timedOut, undefined, `${label} exceeded ${truthProbeTimeoutMs}ms`);
    assert.equal(outcome.error, undefined, `${label} could not start: ${outcome.error?.message}`);
    assert.equal(outcome.code, expectedCode, `${label} returned ${outcome.code}: ${stderr.slice(-1000)}`);
  } finally {
    clearTimeout(timer);
    try {
      await stopProbe(child, closed);
    } finally {
      child.stdout.destroy();
      child.stderr.destroy();
      if (!processIsLive(child)) activeProbes.delete(child);
    }
  }
}

async function assertSandboxProfiles(profiles, port, env, activeProbes) {
  const wrongPort = port === 65535 ? port - 1 : port + 1;
  const addresses = activeNonLoopbackIPv4();
  await runTruthProbe('external TCP', profiles.metro, tcpConnectProbe, ['192.0.2.1', port], env, activeProbes, { expectedCode: 1 });
  await runTruthProbe('UDP', profiles.metro, udpBindProbe, ['127.0.0.1', port], env, activeProbes, { expectedCode: 1 });
  await runTruthProbe('wrong port', profiles.metro, tcpBindProbe, ['127.0.0.1', wrongPort, '0'], env, activeProbes, { expectedCode: 1 });
  await runTruthProbe('deny-all build-network', profiles.deny, tcpBindProbe, ['127.0.0.1', port, '0'], env, activeProbes, { expectedCode: 1 });
  await runTruthProbe('same-port loopback', profiles.metro, tcpBindProbe, ['127.0.0.1', port, '0'], env, activeProbes, { expectedCode: 0 });
  await runTruthProbe('same-port wildcard', profiles.metro, tcpBindProbe, ['0.0.0.0', port, '0'], env, activeProbes, { expectedCode: 0 });
  for (const address of addresses) {
    await runTruthProbe('same-port active interface', profiles.metro, tcpBindProbe, [address, port, '1'], env, activeProbes, { expectedCode: 0, connectHost: address });
  }
  return { activeInterfaceCount: addresses.length, activeInterfaces: addresses };
}

async function verifyPortReservationRelease() {
  const guard = await reservePort();
  const client = net.connect({ host: '127.0.0.1', port: guard.port });
  client.on('error', () => {});
  let rebound;
  let result;
  let primaryError;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('adversarial guard client did not connect')), 500);
      const onError = (error) => {
        clearTimeout(timer);
        reject(error);
      };
      client.once('error', onError);
      client.once('connect', () => {
        client.off('error', onError);
        client.write('GET /held HTTP/1.1\r\nHost: localhost\r\n\r\n', (error) => {
          clearTimeout(timer);
          if (error) reject(error);
          else resolve();
        });
      });
    });
    const started = Date.now();
    await Promise.race([
      guard.release(),
      delay(500).then(() => { throw new Error('adversarial client pinned port guard release'); })
    ]);
    const releaseMs = Date.now() - started;
    rebound = await reservePort(guard.port);
    await rebound.release();
    result = { port: guard.port, releaseMs, exactPortReusable: true };
  } catch (error) {
    primaryError = error;
  }
  const cleanupErrors = [];
  const attempt = async (work) => { try { await work(); } catch (error) { cleanupErrors.push(error); } };
  await attempt(async () => client.destroy());
  await attempt(() => guard.release());
  await attempt(async () => { if (rebound) await rebound.release(); });
  if (primaryError) {
    primaryError.cleanupErrors = cleanupErrors;
    throw primaryError;
  }
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'port reservation regression cleanup failed');
  return result;
}

async function networkRegression() {
  const reservation = await verifyPortReservationRelease();
  const activeProbes = new Set();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'allnewmts-g004-network-regression-'));
  let selected;
  let result;
  let primaryError;
  try {
    selected = await selectGuardedPort(temp, activeProbes);
    await selected.portGuard.release();
    assert.equal(activeProbes.size, 0, 'network regression left active truth probes');
    await assertPortReusable(selected.port);
    result = {
      status: 'PASS',
      mode: 'network-regression',
      reservation,
      truth: selected.truth,
      probesReaped: true,
      exactTruthPortReusable: true,
      selectionAttempts: selected.selectionAttempts
    };
  } catch (error) {
    primaryError = error;
  }
  const cleanupErrors = [];
  const attempt = async (work) => { try { await work(); } catch (error) { cleanupErrors.push(error); } };
  await attempt(async () => { if (selected) await selected.portGuard.release(); });
  for (const probe of [...activeProbes]) {
    await attempt(async () => {
      const closed = processIsLive(probe) ? new Promise((resolve) => probe.once('close', resolve)) : Promise.resolve();
      try { await stopProbe(probe, closed); } finally {
        probe.stdout?.destroy();
        probe.stderr?.destroy();
        if (!processIsLive(probe)) activeProbes.delete(probe);
      }
    });
  }
  await attempt(async () => { if (selected) await assertPortReusable(selected.port); });
  await attempt(async () => assert.equal(activeProbes.size, 0, 'network regression cleanup left active truth probes'));
  await attempt(async () => fs.rmSync(temp, { recursive: true, force: true }));
  if (primaryError) {
    primaryError.cleanupErrors = cleanupErrors;
    throw primaryError;
  }
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'network regression cleanup failed');
  return result;
}

async function selectGuardedPort(temp, activeProbes) {
  for (let attempt = 1; attempt <= maximumSelectionAttempts; attempt += 1) {
    const selector = await reservePort();
    const port = selector.port; // runner-selected; numeric identity only.
    const env = metroEnvironment(port);
    const profiles = sandboxProfiles(temp, port);
    await selector.release(); // Bounded unowned truth-probe handoff.
    const truth = await assertSandboxProfiles(profiles, port, env, activeProbes);
    try {
      const portGuard = await reservePort(port); // runner-guarded; loopback only.
      return { port, portGuard, env, profiles, truth, selectionAttempts: attempt };
    } catch (error) {
      if (error.code !== 'EADDRINUSE' || attempt === maximumSelectionAttempts) throw error;
    }
  }
  throw new Error('failed to reacquire the selected Metro port');
}

const asciiWhitespace = /[ \t\v\f\r\n]/;
const generatedMetroToken = 'RCT_METRO_PORT=${RCT_METRO_PORT}';
const asciiTrim = (value) => value.replace(/^[ \t\v\f\r\n]+|[ \t\v\f\r\n]+$/g, '');
const asciiTokens = (value) => {
  const trimmed = asciiTrim(value);
  return trimmed === '' ? [] : trimmed.split(/[ \t\v\f\r\n]+/);
};

function settingRecords(source, key, file = '<memory>') {
  return source.split(/\r\n|\n|\r/).flatMap((line, index) => {
    const delimiter = line.indexOf('=');
    if (delimiter < 0 || asciiTrim(line.slice(0, delimiter)) !== key) return [];
    return [{ file, line: index + 1, rhs: line.slice(delimiter + 1) }];
  });
}

function assertGeneratedMetroRecords(files) {
  const records = files.flatMap(({ file, source }) => settingRecords(source, 'GCC_PREPROCESSOR_DEFINITIONS', file));
  assert.ok(records.length > 0, 'generated React-Core xcconfig omits exact GCC_PREPROCESSOR_DEFINITIONS records');
  for (const record of records) {
    const candidates = asciiTokens(record.rhs).filter((token) => token.includes('RCT_METRO_PORT'));
    assert.equal(candidates.length, 1, `generated Metro definition count mismatch in ${record.file}:${record.line}`);
    assert.equal(candidates[0], generatedMetroToken, `generated Metro token mismatch in ${record.file}:${record.line}`);
  }
  return { files: new Set(records.map(({ file }) => file)).size, occurrences: records.length };
}

function assertSelectedPort(port, value, label) {
  const expected = String(port);
  assert.match(value, /^[1-9][0-9]*$/, `${label} must be one decimal port`);
  assert.equal(value, expected, `${label} must equal runner-selected ${expected}`);
}

const appCommandLineSection = 'Build settings from command line:';
const appResolvedSection = 'Build settings for action build and target AllNewMTS:';

function appMetroSettingRecords(source) {
  let section = null;
  const headings = { commandLine: 0, resolved: 0 };
  const records = [];
  for (const [index, raw] of source.split(/\r\n|\n|\r/).entries()) {
    if (raw !== '' && !asciiWhitespace.test(raw[0])) {
      section = raw === appCommandLineSection ? appCommandLineSection : raw === appResolvedSection ? appResolvedSection : null;
      if (section === appCommandLineSection) headings.commandLine += 1;
      if (section === appResolvedSection) headings.resolved += 1;
    }
    const delimiter = raw.indexOf('=');
    if (delimiter >= 0 && asciiTrim(raw.slice(0, delimiter)) === 'RCT_METRO_PORT') {
      records.push({ section, line: index + 1, raw, rhs: raw.slice(delimiter + 1) });
    }
  }
  return { headings, records };
}

function assertMetroSettings(port, appSettings, podSettings) {
  const app = appMetroSettingRecords(appSettings);
  try {
    assert.equal(app.headings.commandLine, 1, 'App settings must contain exactly one command-line settings heading');
    assert.equal(app.headings.resolved, 1, 'App settings must contain exactly one resolved target heading');
    assert.equal(app.records.filter(({ section }) => section === null).length, 0, 'App settings contain an unclassified RCT_METRO_PORT record');
    const commandLine = app.records.filter(({ section }) => section === appCommandLineSection);
    const resolved = app.records.filter(({ section }) => section === appResolvedSection);
    assert.equal(commandLine.length, 1, 'App command-line settings must contain exactly one RCT_METRO_PORT record');
    assert.equal(resolved.length, 1, 'App resolved target settings must contain exactly one RCT_METRO_PORT record');
    assertSelectedPort(port, asciiTrim(commandLine[0].rhs), 'App command-line RCT_METRO_PORT');
    assertSelectedPort(port, asciiTrim(resolved[0].rhs), 'App resolved RCT_METRO_PORT');

    const podCandidates = settingRecords(podSettings, 'GCC_PREPROCESSOR_DEFINITIONS')
      .flatMap(({ rhs }) => asciiTokens(rhs))
      .filter((token) => token.includes('RCT_METRO_PORT'));
    assert.equal(podCandidates.length, 1, 'React-Core resolved settings must contain exactly one RCT_METRO_PORT token overall');
    const prefix = 'RCT_METRO_PORT=';
    assert.ok(podCandidates[0].startsWith(prefix), 'React-Core resolved Metro token must use exact key');
    assertSelectedPort(port, podCandidates[0].slice(prefix.length), 'React-Core RCT_METRO_PORT');
  } catch (error) {
    error.appMetroSettings = app.records;
    throw error;
  }
  return app.records;
}

function assertBuildArgv(port, args) {
  const assignments = args.filter((argument) => argument.startsWith('RCT_METRO_PORT='));
  assert.equal(assignments.length, 1, 'compiled-build argv must contain exactly one RCT_METRO_PORT assignment');
  assertSelectedPort(port, assignments[0].slice('RCT_METRO_PORT='.length), 'compiled-build RCT_METRO_PORT');
}

function assertExpoArgv(port, args) {
  const flags = args.flatMap((argument, index) => argument === '--port' ? [index] : []);
  assert.equal(flags.length, 1, 'Expo argv must contain exactly one --port flag');
  assertSelectedPort(port, args[flags[0] + 1] ?? '', 'Expo --port');
}

function buildFailureEvidenceRegression() {
  const secretA = 'alpha123';
  const secretB = 'bravo456';
  assert.equal(Buffer.byteLength(secretA), Buffer.byteLength(secretB));
  const sensitive = (secret) => [
    `TOKEN=${secret}`,
    `prefix TOKEN : ${secret}`,
    `api.key\t=\t"${secret}"`,
    'TOKEN=',
    `Authorization: Basic ${secret}`,
    `Authorization = Bearer ${secret}`,
    `Cookie: sid=${secret}`,
    `Set-Cookie: sid=${secret}; Secure`,
    `https://${secret}@example.test/path`,
    `https://example.test/path?q=${secret}`,
    `https://example.test/path#${secret}`
  ];
  const stdout = (secret) => {
    const lines = [`${'🙂'.repeat(8200)}`, ...sensitive(secret), 'ATTEMPT7_CAUSAL_ERROR: error: preserved before warning flood'];
    for (let index = 0; index < 220; index += 1) {
      lines.push(`cause-${index}: error: ${'가'.repeat(96)}`, ...Array.from({ length: 8 }, (_, context) => `context-${index}-${context}-${'x'.repeat(96)}`));
    }
    lines.push('warning: context only', '** BUILD FAILED **');
    return `${lines.join('\n')}\n`;
  };
  const stderr = (secret) => {
    const lines = [`${'🙂'.repeat(8200)}`, ...sensitive(secret)];
    for (let index = 0; index < 220; index += 1) {
      lines.push(`stderr-${index}: error: ${'가'.repeat(96)}`, ...Array.from({ length: 8 }, (_, context) => `stderr-context-${index}-${context}-${'y'.repeat(96)}`));
    }
    lines.push('The following build commands failed:', 'Command CompileSwift failed with a nonzero exit code', 'final error: compiler stopped');
    return `${lines.join('\r\n')}\r\n`;
  };
  const result = (secret) => ({ signal: null, status: 65, stderr: Buffer.from(stderr(secret)), stdout: Buffer.from(stdout(secret)) });
  const first = compiledBuildError(result(secretA));
  const second = compiledBuildError(result(secretB));
  assert.deepEqual(first.buildFailureEvidence, second.buildFailureEvidence);
  assert.equal(first.buildFailureEvidenceSha256, second.buildFailureEvidenceSha256);
  assert.equal(Object.isFrozen(first.buildFailureEvidence), true);
  assert.ok(canonicalBytes(first.buildFailureEvidence).length <= buildFailureEvidenceBytes);
  assert.equal(first.xcodeStatus, 65);
  assert.equal(first.xcodeSignal, null);

  const published = stableJson(first.buildFailureEvidence);
  assert.doesNotMatch(published, /originalSha|originalDigest/i);
  const originalDigest = sha256(result(secretA).stdout);
  assert.equal(published.includes(originalDigest), false);
  const decoded = [];
  const collectBase64 = (value) => {
    if (Array.isArray(value)) return value.forEach(collectBase64);
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key.endsWith('Base64')) decoded.push(Buffer.from(child, 'base64').toString('utf8'));
      else collectBase64(child);
    }
  };
  collectBase64(first.buildFailureEvidence);
  const retained = decoded.join('\n');
  assert.match(retained, /ATTEMPT7_CAUSAL_ERROR: error:/);
  for (const secret of [secretA, secretB]) assert.equal(retained.includes(secret), false);
  const streams = first.buildFailureEvidence.streams;
  for (const stream of [streams.stdout, streams.stderr]) {
    assert.ok(stream.windows.headByteCount <= buildFailureWindowBytes);
    assert.ok(stream.windows.tailByteCount <= buildFailureWindowBytes);
    assert.ok(stream.windows.headByteCount + stream.windows.tailByteCount <= stream.sanitizedByteCount);
    assert.ok(canonicalBytes(stream.causal.earliest).length <= buildFailureCausalPartitionBytes);
    assert.ok(canonicalBytes(stream.causal.latest).length <= buildFailureCausalPartitionBytes);
    for (const counts of [stream.causal.counts.causalMatches, stream.causal.counts.contextLines]) {
      assert.equal(counts.retained + counts.omitted, counts.total);
    }
  }
  assert.equal(streams.stdout.causal.counts.causalMatches.total, 222);
  assert.equal(streams.stderr.causal.counts.causalMatches.total, 223);
  const classes = new Set(['stdout', 'stderr'].flatMap((stream) => [
    ...streams[stream].causal.earliest,
    ...streams[stream].causal.latest
  ]).flatMap(({ matches }) => matches.map(({ class: classification }) => classification)));
  assert.deepEqual([...classes].sort(), ['BUILD_FAILED', 'COMMAND_FAILED', 'DIAGNOSTIC_ERROR', 'FAILED_COMMAND_LIST']);
  const reduced = formatBuildFailureEvidence(result(secretA), null, 180000).evidence;
  const repeated = formatBuildFailureEvidence(result(secretA), null, 180000).evidence;
  assert.deepEqual(reduced, repeated);
  assert.ok(canonicalBytes(reduced).length <= 180000);
  assert.equal(reduced.streams.stdout.causal.counts.truncated, true);
  assert.equal(reduced.streams.stderr.causal.counts.truncated, true);

  assert.equal(sanitizeBuildLine(`TOKEN=${secretA}`), `TOKEN=${namedValueMarker}`);
  assert.equal(sanitizeBuildLine(`TOKEN : ${secretA}`), `TOKEN : ${namedValueMarker}`);
  assert.equal(sanitizeBuildLine(`api.key\t=\t"${secretA}"`), `api.key\t=\t${namedValueMarker}`);
  assert.equal(sanitizeBuildLine('TOKEN='), `TOKEN=${namedValueMarker}`);
  for (const nearMiss of [`/TOKEN=${secretA}`, `XTOKEN=${secretA}`, `TOKEN ${secretA}`, `TOKEN\u00a0=${secretA}`]) {
    assert.equal(sanitizeBuildLine(nearMiss), nearMiss);
  }

  const envelope = buildFailureEnvelope(first, 0);
  assert.equal(envelope.buildFailureEvidence, first.buildFailureEvidence);
  assert.equal(envelope.buildFailureEvidenceSha256, first.buildFailureEvidenceSha256);
  const marker = `${buildFailurePrefix}${stableJson(envelope)}`;
  assert.equal(marker.split(buildFailurePrefix).length - 1, 1);
  assert.deepEqual(JSON.parse(marker.slice(buildFailurePrefix.length)).buildFailureEvidence, first.buildFailureEvidence);

  const fallback = compiledBuildError(result(secretA), 'sanitize');
  assert.deepEqual(fallback.buildFailureEvidence, {
    code: 'BUILD_FAILURE_EVIDENCE_FORMAT_ERROR',
    command: 'xcodebuild',
    originalByteCounts: { stderr: result(secretA).stderr.length, stdout: result(secretA).stdout.length },
    schema: buildFailureSchema,
    signal: null,
    status: 65
  });
  assert.equal(fallback.xcodeStatus, 65);
  const emitted = [];
  assert.equal(emitBuildFailureEnvelope(fallback, [new Error('cleanup')], (line) => emitted.push(line)), fallback);
  assert.equal(emitted.length, 1);
  assert.equal(JSON.parse(emitted[0].slice(buildFailurePrefix.length)).cleanupErrorCount, 1);
  assert.doesNotMatch(stableJson(fallback.buildFailureEvidence), /alpha123|sha256|stdoutBase64|stderrBase64/i);
  return {
    canonicalWithinCap: canonicalBytes(first.buildFailureEvidence).length <= buildFailureEvidenceBytes,
    causalClasses: [...classes].sort(),
    evidenceIdentityPreserved: true,
    formatterFallbackSafe: true,
    originalDigestsOmitted: true,
    sensitiveValuesRedacted: true,
    wholeStreamSanitizedBeforeSelection: true
  };
}

function metroEvidenceRegression() {
  const port = 43210;
  const exact = 'GCC_PREPROCESSOR_DEFINITIONS = $(inherited) RCT_METRO_PORT=${RCT_METRO_PORT}';
  const podspec = fs.readFileSync(path.join(root, 'node_modules/react-native/React-Core.podspec'), 'utf8');
  assert.deepEqual([...podspec.matchAll(/"GCC_PREPROCESSOR_DEFINITIONS"\s*=>\s*"([^"]*)"/g)].map((match) => match[1]), ['RCT_METRO_PORT=${RCT_METRO_PORT}']);
  assert.equal(asciiWhitespace.test('\u00a0'), false, 'tokenization must remain ASCII-only');
  assert.equal(assertGeneratedMetroRecords([
    { file: 'React-Core.debug.xcconfig', source: exact },
    { file: 'React-Core.release.xcconfig', source: exact }
  ]).occurrences, 2);

  const malformedGenerated = [
    'GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT="${RCT_METRO_PORT}"',
    'OTHER = RCT_METRO_PORT="${RCT_METRO_PORT}"',
    'GCC_PREPROCESSOR_DEFINITIONS = $(inherited)',
    `GCC_PREPROCESSOR_DEFINITIONS = ${generatedMetroToken} ${generatedMetroToken}`,
    'GCC_PREPROCESSOR_DEFINITIONS = "RCT_METRO_PORT=${RCT_METRO_PORT}"',
    "GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT='${RCT_METRO_PORT}'",
    'GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT="${RCT_METRO_PORT}',
    'GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT=${RCT_METRO_PORT}"',
    'GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT=""${RCT_METRO_PORT}""',
    'GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT=\\"${RCT_METRO_PORT}\\"',
    'GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT=" ${RCT_METRO_PORT}"',
    'GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT="${RCT_METRO_PORT}"\u00a0OTHER',
    'GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT="${OTHER}"',
    'GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT=""',
    'GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT="${RCT_METRO_PORT:-8081}"',
    'GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT=8081',
    `GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT=${port}`,
    `GCC_PREPROCESSOR_DEFINITIONS = ${generatedMetroToken} RCT_METRO_PORT=${port}`,
    `GCC_PREPROCESSOR_DEFINITIONS[sdk=iphonesimulator*] = ${generatedMetroToken}`,
    `// GCC_PREPROCESSOR_DEFINITIONS = ${generatedMetroToken}`
  ];
  for (const source of malformedGenerated) {
    assert.throws(() => assertGeneratedMetroRecords([{ file: 'React-Core.debug.xcconfig', source }]));
  }

  const app = `Build settings from command line:\n    RCT_METRO_PORT = ${port}\nBuild settings for action build and target AllNewMTS:\n    SDK_VERSION = 18.4\n    RCT_METRO_PORT = ${port}\n    UNRELATED = 8081`;
  const pods = `GCC_PREPROCESSOR_DEFINITIONS = SDK_VERSION=18.4 RCT_METRO_PORT=${port} OTHER=8081`;
  const appEvidence = assertMetroSettings(port, app, pods);
  assert.deepEqual(appEvidence, [
    { section: 'Build settings from command line:', line: 2, raw: `    RCT_METRO_PORT = ${port}`, rhs: ` ${port}` },
    { section: 'Build settings for action build and target AllNewMTS:', line: 5, raw: `    RCT_METRO_PORT = ${port}`, rhs: ` ${port}` }
  ]);
  const badApps = [
    '',
    `Build settings from command line:\n    RCT_METRO_PORT = ${port}`,
    `Build settings for action build and target AllNewMTS:\n    RCT_METRO_PORT = ${port}`,
    `Build settings from command line:\nBuild settings from command line:\n    RCT_METRO_PORT = ${port}\nBuild settings for action build and target AllNewMTS:\n    RCT_METRO_PORT = ${port}`,
    `${app}\n    RCT_METRO_PORT = ${port}`,
    `Build settings from command line:\n    RCT_METRO_PORT = ${port}\nBuild settings for action build and target AllNewMTS:\n    RCT_METRO_PORT = ${port}\nOther heading:\n    RCT_METRO_PORT = ${port}`,
    `Build settings from command line:\n    RCT_METRO_PORT = ${port}\nBuild settings for action clean and target AllNewMTS:\n    RCT_METRO_PORT = ${port}`,
    `RCT_METRO_PORT = ${port}\n${app}`,
    app.replace(`RCT_METRO_PORT = ${port}`, 'RCT_METRO_PORT = '),
    app.replace(`RCT_METRO_PORT = ${port}`, 'RCT_METRO_PORT = port'),
    app.replace(`RCT_METRO_PORT = ${port}`, 'RCT_METRO_PORT = 43211'),
    app.replace(`RCT_METRO_PORT = ${port}`, 'RCT_METRO_PORT = 8081')
  ];
  for (const bad of badApps) {
    assert.throws(() => assertMetroSettings(port, bad, pods));
  }
  let preservedFailure;
  try {
    assertMetroSettings(port, badApps.at(-1), pods);
  } catch (error) {
    preservedFailure = error;
  }
  assert.deepEqual(preservedFailure?.appMetroSettings, [
    { section: 'Build settings from command line:', line: 2, raw: '    RCT_METRO_PORT = 8081', rhs: ' 8081' },
    { section: 'Build settings for action build and target AllNewMTS:', line: 5, raw: `    RCT_METRO_PORT = ${port}`, rhs: ` ${port}` }
  ]);
  for (const bad of ['GCC_PREPROCESSOR_DEFINITIONS = OTHER=18.4', 'GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT=', 'GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT=43211', 'GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT=8081', `GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT=${port} RCT_METRO_PORT=${port}`]) {
    assert.throws(() => assertMetroSettings(port, app, bad));
  }

  assert.doesNotThrow(() => assertBuildArgv(port, ['SDK_VERSION=18.4', `RCT_METRO_PORT=${port}`, 'OTHER=8081']));
  for (const args of [[], ['RCT_METRO_PORT='], ['RCT_METRO_PORT=43211'], ['RCT_METRO_PORT=8081'], [`RCT_METRO_PORT=${port}`, `RCT_METRO_PORT=${port}`]]) {
    assert.throws(() => assertBuildArgv(port, args));
  }
  assert.doesNotThrow(() => assertExpoArgv(port, ['start', '--sdk-version', '18.4', '--port', String(port), '8081']));
  for (const args of [[], ['--port'], ['--port', '43211'], ['--port', '8081'], ['--port', String(port), '--port', String(port)], [`--port=${port}`]]) {
    assert.throws(() => assertExpoArgv(port, args));
  }
  const buildFailureEvidence = buildFailureEvidenceRegression();
  return {
    status: 'PASS',
    mode: 'metro-evidence-regression',
    generatedRecords: 2,
    exactUnquotedGeneratedAccepted: true,
    quotedGeneratedRejected: true,
    malformedGeneratedRecordsRejected: true,
    malformedNumericEvidenceRejected: true,
    appRawMatches: 2,
    appCommandLineMatches: 1,
    appResolvedMatches: 1,
    appEvidencePreservedOnSuccess: true,
    appEvidencePreservedOnFailure: true,
    buildFailureEvidence
  };
}

function generatedMetroSettings() {
  const directory = path.join(root, 'ios/Pods/Target Support Files/React-Core');
  const files = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.xcconfig'))
    .map((entry) => ({ file: path.relative(root, path.join(directory, entry.name)), source: fs.readFileSync(path.join(directory, entry.name), 'utf8') }));
  return assertGeneratedMetroRecords(files);
}

function processIsLive(child) {
  return child && child.exitCode === null && child.signalCode === null;
}

async function reapChild(child) {
  if (!processIsLive(child)) return;
  await Promise.race([
    new Promise((resolve) => child.once('close', resolve)),
    delay(3000)
  ]);
  assert.equal(processIsLive(child), false, 'owned Metro launcher was not reaped');
}

async function stopProcessGroup(child, pgid) {
  if (!pgid) return;
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    try { process.kill(-pgid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try { process.kill(-pgid, 0); } catch (error) { if (error.code === 'ESRCH') break; throw error; }
      await delay(100);
    }
    try { process.kill(-pgid, 0); } catch (error) {
      if (error.code === 'ESRCH') { await reapChild(child); return; }
      throw error;
    }
  }
  assert.fail('owned Metro process group did not terminate');
}

function selectedPortListeners(port) {
  const result = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { cwd: root, encoding: 'utf8' });
  assert.ok([0, 1].includes(result.status), `lsof failed for selected port ${port}`);
  return (result.stdout ?? '').split(/\r?\n/).slice(1).filter(Boolean).map((row) => {
    const pid = Number(row.trim().split(/\s+/)[1]);
    const endpoint = row.match(/\bTCP\s+(\S+)\s+\(LISTEN\)$/)?.[1];
    assert.ok(Number.isSafeInteger(pid) && pid > 0 && endpoint, `unparseable selected-port listener: ${row}`);
    return { pid, endpoint };
  });
}

function assertMetroOwned(port, child, metroPgid) {
  assert.equal(child?.spawnError, undefined, `Metro spawn failed: ${child?.spawnError?.message}`);
  assert.ok(processIsLive(child), 'Metro launcher is not alive');
  const launcher = spawnSync('ps', ['-o', 'pgid=', '-p', String(child.pid)], { encoding: 'utf8' });
  assert.equal(launcher.status, 0, `Metro launcher PID ${child.pid} is not alive`);
  assert.equal(Number(launcher.stdout.trim()), metroPgid, `Metro launcher left owned PGID ${metroPgid}`);
  const listeners = selectedPortListeners(port);
  assert.equal(listeners.length, 1, `selected port must have exactly one LISTEN row, found ${listeners.length}`);
  const [listener] = listeners;
  assert.equal(listener.endpoint, `127.0.0.1:${port}`, `Metro listener endpoint mismatch: ${listener.endpoint}`);
  const group = spawnSync('ps', ['-o', 'pgid=', '-p', String(listener.pid)], { encoding: 'utf8' });
  assert.equal(group.status, 0, `could not resolve listener PGID for ${listener.pid}`);
  assert.equal(Number(group.stdout.trim()), metroPgid, `listener PID ${listener.pid} is outside owned PGID ${metroPgid}`);
  return { listenerPid: listener.pid, endpoint: listener.endpoint };
}

async function assertMetroNetwork(port, child, metroPgid) {
  const ownership = assertMetroOwned(port, child, metroPgid); // Metro-owned is observed only here.
  assert.equal(await connectTcp('127.0.0.1', port), true, 'Metro loopback connection failed');
  const addresses = activeNonLoopbackIPv4();
  for (const address of addresses) {
    assert.equal(await connectTcp(address, port), false, `Metro accepted active nonloopback connection on ${address}:${port}`);
  }
  return { ...ownership, rejectedActiveInterfaces: addresses.length };
}

async function waitForMetro(port, child, metroPgid) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    assert.ok(processIsLive(child), 'Metro exited before readiness');
    const ready = await new Promise((resolve) => {
      const request = http.get({ hostname: '127.0.0.1', port, path: '/status', timeout: 500 }, (response) => {
        let body = '';
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => resolve(body.includes('packager-status:running')));
      });
      request.on('error', () => resolve(false));
      request.on('timeout', () => { request.destroy(); resolve(false); });
    });
    if (ready) return assertMetroOwned(port, child, metroPgid);
    await delay(500);
  }
  throw new Error('Metro did not become ready on the owned endpoint');
}

async function assertPortReusable(port) {
  assert.equal(selectedPortListeners(port).length, 0, 'cleanup left a selected-port listener');
  const probe = await reservePort(port);
  await probe.release();
}

function closeFd(fd) {
  if (fd !== undefined) fs.closeSync(fd);
}

function parsedSockets(pid, port) {
  const result = spawnSync('lsof', ['-nP', '-a', '-p', String(pid), '-iTCP', '-iUDP'], { encoding: 'utf8' });
  assert.ok([0, 1].includes(result.status), `lsof failed for App PID ${pid}`);
  const rows = (result.stdout ?? '').split(/\r?\n/).slice(1).filter(Boolean);
  return rows.map((row) => {
    const protocol = row.match(/\b(TCP|UDP)\b/)?.[1];
    const endpoint = row.match(/(?:TCP|UDP)\s+([^ ]+)/)?.[1] ?? '';
    assert.equal(protocol, 'TCP', `disallowed App socket protocol: ${protocol ?? 'unknown'}`);
    assert.match(endpoint, new RegExp(`^[^>]*->127\\.0\\.0\\.1:${port}(?:\\s|$)`), `disallowed App socket endpoint: ${endpoint}`);
    return { protocol, endpoint: `127.0.0.1:${port}` };
  });
}

async function waitForMarker(stdoutFile, stderrFile, pid, port) {
  const deadline = Date.now() + 90000;
  const samples = [];
  while (Date.now() < deadline) {
    samples.push(...parsedSockets(pid, port));
    const lines = [stdoutFile, stderrFile]
      .filter(fs.existsSync)
      .flatMap((file) => fs.readFileSync(file, 'utf8').split(/\r?\n/))
      .filter((line) => line.includes(markerPrefix));
    assert.ok(lines.length <= 1, 'Development Build emitted duplicate readiness markers');
    if (lines.length === 1) {
      const payload = JSON.parse(lines[0].slice(lines[0].indexOf(markerPrefix) + markerPrefix.length));
      assert.deepEqual(payload, {
        status: 'PASS',
        sourceSha256: '4d63ba22ac5339cfd3068cffa91710e0099481da81d974e2aff0ce7ae39ed53e',
        formCount: 1,
        labelCount: 2,
        editCount: 1,
        buttonCount: 2,
        module: 'AllNewMTSRuntime',
        createCode: 'OK'
      });
      samples.push(...parsedSockets(pid, port));
      return { payload, samples: samples.length };
    }
    await delay(100);
  }
  throw new Error(`Development Build emitted no ${markerPrefix} marker`);
}

async function developmentBuild() {
  await preflight();
  const baseline = run('git', ['status', '--porcelain=v1', '-z']);
  const activeProbes = new Set();
  let nofollow;
  let packageBackedUp = false;
  let packageMutationArmed = false;
  let packageBaseline;
  let temp;
  let simulator;
  let portGuard;
  let port;
  let env;
  let profiles;
  let offlineAppleDependencies;
  let appInstalled = false;
  let appPid;
  let metro;
  let metroPgid;
  let metroStdoutFd;
  let metroStderrFd;
  let appMetroSettings;
  let nestedSwiftPm;
  let simulatorBootedByRunner = false;
  let result;
  let primaryError;
  try {
    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'allnewmts-g004-development-build-'));
    nofollow = await startNoFollowSession();
    packageBaseline = nofollow.ready.baseline;
    packageBackedUp = true;
    simulator = availableSimulator();
    const selected = await selectGuardedPort(temp, activeProbes);
    ({ port, portGuard, env, profiles } = selected);
    env.CP_CACHE_DIR = path.join(temp, 'cocoapods-cache');
    fs.mkdirSync(env.CP_CACHE_DIR);
    offlineAppleDependencies = prepareLocalAppleDependencies(temp, env);
    const sandbox = (args) => run('/usr/bin/sandbox-exec', ['-f', profiles.deny, ...args], { env });
    await nofollow.request({ op: 'arm' });
    packageMutationArmed = true;
    sandbox([path.join(root, 'node_modules/.bin/expo'), 'prebuild', '--no-install', '--platform', 'ios']);
    sandbox(['pod', 'install', '--no-repo-update', '--project-directory=ios']);
    const swiftPm = await prepareNestedSwiftPm(nofollow, profiles, env);
    nestedSwiftPm = swiftPm.evidence;
    env.PATH = swiftPm.envPath;
    const generatedSettings = generatedMetroSettings();
    const destination = `id=${simulator.udid}`;
    const appShow = sandbox([swiftPm.useXcodebuild(), '-workspace', 'ios/AllNewMTS.xcworkspace', '-scheme', 'AllNewMTS', '-configuration', 'Debug', '-sdk', 'iphonesimulator', '-destination', destination, `RCT_METRO_PORT=${port}`, '-showBuildSettings']);
    const podShow = sandbox([swiftPm.useXcodebuild(), '-project', 'ios/Pods/Pods.xcodeproj', '-target', 'React-Core', '-configuration', 'Debug', `RCT_METRO_PORT=${port}`, '-showBuildSettings']);
    appMetroSettings = assertMetroSettings(port, appShow, podShow);
    const buildArgs = [swiftPm.useXcodebuild(), '-quiet', '-workspace', 'ios/AllNewMTS.xcworkspace', '-scheme', 'AllNewMTS', '-configuration', 'Debug', '-sdk', 'iphonesimulator', '-destination', destination, '-derivedDataPath', path.join(temp, 'ios-derived'), 'CODE_SIGNING_ALLOWED=NO', `RCT_METRO_PORT=${port}`, 'build'];
    assertBuildArgv(port, buildArgs);
    const compiled = runCompiledBuild('/usr/bin/sandbox-exec', ['-f', profiles.deny, ...buildArgs], { env });
    const compiledOutput = `${compiled.stdout?.toString('utf8') ?? ''}${compiled.stderr?.toString('utf8') ?? ''}`;
    nestedSwiftPm.mainCompiledBuildOutputCounts = assertNestedSwiftPmCacheOutput(compiledOutput, 'main compiled build');
    if (simulator.state !== 'Booted') {
      run('xcrun', ['simctl', 'boot', simulator.udid], { env });
      simulatorBootedByRunner = true;
    }
    run('xcrun', ['simctl', 'bootstatus', simulator.udid, '-b'], { env });
    const metroFile = '/usr/bin/sandbox-exec';
    const metroArgs = ['-f', profiles.metro, path.join(root, 'node_modules/.bin/expo'), 'start', '--offline', '--localhost', '--port', String(port)];
    assertExpoArgv(port, metroArgs);
    metroStdoutFd = fs.openSync(path.join(temp, 'metro.stdout.log'), 'w');
    metroStderrFd = fs.openSync(path.join(temp, 'metro.stderr.log'), 'w');
    const metroOptions = {
      cwd: root,
      env,
      detached: true,
      stdio: ['ignore', metroStdoutFd, metroStderrFd]
    };
    await portGuard.release();
    metro = spawn(metroFile, metroArgs, metroOptions);
    metro.once('error', (error) => { metro.spawnError = error; });
    metroPgid = metro.pid;
    assert.ok(Number.isSafeInteger(metroPgid) && metroPgid > 0, 'Metro launcher has no owned PGID');
    const group = spawnSync('ps', ['-o', 'pgid=', '-p', String(metro.pid)], { encoding: 'utf8' });
    assert.equal(group.status, 0, 'could not record detached Metro PGID');
    assert.equal(Number(group.stdout.trim()), metroPgid, 'detached Metro launcher did not own its process group');
    await waitForMetro(port, metro, metroPgid);
    const readinessNetwork = await assertMetroNetwork(port, metro, metroPgid);
    const app = path.join(temp, 'ios-derived/Build/Products/Debug-iphonesimulator/AllNewMTS.app');
    assert.ok(fs.existsSync(app), 'built iOS app is missing');
    const existing = spawnSync('xcrun', ['simctl', 'get_app_container', simulator.udid, bundleId], { cwd: root, encoding: 'utf8', env });
    assert.notEqual(existing.status, 0, `refusing to replace pre-existing ${bundleId}`);
    run('xcrun', ['simctl', 'install', simulator.udid, app], { env });
    appInstalled = true;
    const stdoutFile = path.join(temp, 'ios-runtime.stdout.log');
    const stderrFile = path.join(temp, 'ios-runtime.stderr.log');
    const prelaunchNetwork = await assertMetroNetwork(port, metro, metroPgid);
    const launch = run('xcrun', ['simctl', 'launch', '--terminate-running-process', `--stdout=${stdoutFile}`, `--stderr=${stderrFile}`, simulator.udid, bundleId], { env });
    appPid = Number(launch.trim().match(/:\s*([0-9]+)$/)?.[1]);
    assert.ok(Number.isSafeInteger(appPid) && appPid > 0, `could not parse App PID: ${launch.trim()}`);
    const observed = await waitForMarker(stdoutFile, stderrFile, appPid, port);
    const finalNetwork = await assertMetroNetwork(port, metro, metroPgid);
    result = {
      status: 'PASS',
      port,
      simulator: simulator.name,
      marker: observed.payload,
      socketSamples: observed.samples,
      portLifecycle: ['runner-selected', 'runner-guarded', 'Metro-owned'],
      selectionAttempts: selected.selectionAttempts,
      sandboxTruth: selected.truth,
      metroChecks: { readinessNetwork, prelaunchNetwork, finalNetwork },
      networkEvidence: 'bounded unowned truth-probe and spawn handoffs; no uninterrupted exclusive ownership or SBPL interface-enforcement claim; PID-scoped samples make no continuous kernel-level denial claim',
      generatedMetroSettings: generatedSettings,
      appMetroSettings,
      offlineAppleDependencies,
      nestedSwiftPm,
      toolchain: toolchainProvenance(),
      developmentBuildInvocations: 1
    };
  } catch (error) {
    appMetroSettings = error.appMetroSettings ?? appMetroSettings;
    if (appMetroSettings) error.appMetroSettings = appMetroSettings;
    primaryError = error;
  }
  const cleanupErrors = [];
  const attempt = async (work) => { try { await work(); } catch (error) { cleanupErrors.push(error); } };
  await attempt(async () => { if (appPid && simulator) run('xcrun', ['simctl', 'terminate', simulator.udid, bundleId], { env }); });
  await attempt(async () => { if (appInstalled && simulator) run('xcrun', ['simctl', 'uninstall', simulator.udid, bundleId], { env }); });
  await attempt(async () => { if (portGuard) await portGuard.release(); });
  for (const probe of [...activeProbes]) {
    await attempt(async () => {
      const closed = processIsLive(probe) ? new Promise((resolve) => probe.once('close', resolve)) : Promise.resolve();
      try { await stopProbe(probe, closed); } finally {
        probe.stdout?.destroy();
        probe.stderr?.destroy();
        if (!processIsLive(probe)) activeProbes.delete(probe);
      }
    });
  }
  await attempt(() => stopProcessGroup(metro, metroPgid));
  await attempt(async () => closeFd(metroStdoutFd));
  await attempt(async () => closeFd(metroStderrFd));
  await attempt(async () => { if (port) await assertPortReusable(port); });
  await attempt(async () => assert.equal(activeProbes.size, 0, 'cleanup left active truth probes'));
  await attempt(async () => { if (simulatorBootedByRunner) run('xcrun', ['simctl', 'shutdown', simulator.udid], { env }); });
  await attempt(async () => {
    if (nofollow && packageBackedUp && packageMutationArmed) {
      const restoration = await nofollow.request({ op: 'restore_package' });
      assert.equal(restoration.restored, true, `ExpoModulesJSI restoration failed: ${JSON.stringify(restoration.failures)}`);
      assert.deepEqual(restoration.rootStreams, packageBaseline.rootStreams);
      assert.deepEqual(restoration.rootAggregates, packageBaseline.rootAggregates);
      assert.equal(restoration.wholeStreamBase64, packageBaseline.wholeStreamBase64);
      assert.equal(restoration.wholeSha256, packageBaseline.wholeSha256);
    }
  });
  await attempt(async () => fs.rmSync(path.join(root, 'ios'), { recursive: true, force: true }));
  await attempt(async () => closeNoFollowSession(nofollow));
  await attempt(async () => { if (temp) fs.rmSync(temp, { recursive: true, force: true }); });
  await attempt(async () => assert.equal(exists('ios'), false, 'cleanup left root ios/'));
  await attempt(async () => assert.equal(exists('android'), false, 'cleanup created root android/'));
  await attempt(async () => assert.equal(run('git', ['status', '--porcelain=v1', '-z']), baseline, 'cleanup did not restore the working-tree baseline'));
  if (primaryError) {
    primaryError.cleanupErrors = cleanupErrors;
    throwAfterBuildFailureEmission(primaryError, cleanupErrors, undefined, 'development-build');
  }
  if (cleanupErrors.length) {
    const error = cleanupOnlyPrimary(cleanupErrors, appMetroSettings);
    throwAfterBuildFailureEmission(error, cleanupErrors, undefined, 'development-build');
  }
  return result;
}

const result = requestedMode === '--preflight'
  ? await preflight()
  : requestedMode === '--network-regression'
    ? await networkRegression()
    : requestedMode === '--pod-cache-regression'
      ? podCacheRegression()
      : requestedMode === '--metro-evidence-regression'
        ? metroEvidenceRegression()
      : requestedMode === '--build-failure-marker-transport-child'
          ? buildFailureMarkerTransportChild()
          : requestedMode === '--generic-failure-marker-transport-child'
            ? genericFailureMarkerTransportChild()
          : requestedMode === '--nested-swiftpm-regression'
            ? await nestedSwiftPmRegression()
        : await developmentBuild();
console.log(`G004_DEVELOPMENT_BUILD=${JSON.stringify(result)}`);
