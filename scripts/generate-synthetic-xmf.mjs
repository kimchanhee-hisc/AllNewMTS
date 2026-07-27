import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const replacements = [
  ['scrno="1200"', 'scrno="9907"'],
  ['scrname="관심종목_그룹추가"', 'scrname="합성_목록추가"'],
  ['name="Form"', 'name="SyntheticForm"'],
  ['Form_', 'SyntheticForm_'],
  ['Form.', 'SyntheticForm.'],
  ['lbl0', 'syntheticTitle'],
  ['lbl1', 'syntheticPrompt'],
  ['edtGroupNm', 'syntheticInput'],
  ['btnAdd', 'syntheticAccept'],
  ['btnCancel', 'syntheticDismiss'],
  ['CCS20000', 'SYN90010'],
  ['CCS20001', 'SYN90011'],
  ['ly_vert="18,0,324,26,1"', 'ly_vert="24,8,300,24,1"'],
  ['ly_vert="18,42,324,20,1"', 'ly_vert="24,44,300,22,1"'],
  ['ly_vert="18,68,324,40,1"', 'ly_vert="24,76,300,42,1"'],
  ['ly_vert="185,142,157,56,1"', 'ly_vert="176,150,148,48,1"'],
  ['ly_vert="18,142,157,56,1"', 'ly_vert="24,150,140,48,1"']
];

export function generateSyntheticFixture(source) {
  let output = source.toString('utf8');
  for (const [from, to] of replacements) {
    const count = output.split(from).length - 1;
    assert.ok(count > 0, `missing generator source token: ${from}`);
    output = output.replaceAll(from, to);
  }

  const match = output.match(/\t<CONTROL_INFO>\r?\n([\s\S]*?)\r?\n\t<\/CONTROL_INFO>/);
  assert.ok(match, 'missing CONTROL_INFO');
  const controls = match[1].split(/\r?\n/).filter(Boolean);
  assert.equal(controls.length, 6, 'unexpected control count');
  const reordered = [controls[4], controls[1], controls[3], controls[2], controls[0], controls[5]];
  output = output.replace(match[0], `\t<CONTROL_INFO>\n${reordered.join('\n')}\n\t</CONTROL_INFO>`);
  return Buffer.from(output.replaceAll('\r\n', '\n'), 'utf8');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const source = fs.readFileSync(path.join(root, 'test/oracles/sources/mts_screen/HS1200P08.xmf_'));
  const destination = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(root, 'test/oracles/synthetic/renamed-reordered.xmf_');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, generateSyntheticFixture(source));
}
