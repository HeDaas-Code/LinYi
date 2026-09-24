/**
 * truman-town.civilization.legacy.summary.writer — 遗产撰写器 / Legacy Writer
 *
 * 用 LLM（ai.llm.gateway）生成 200-500 字的文明遗产描述；
 * constrain() 负责把任意长度文本约束到 [min, max] 区间（超长截断、过短补足）。
 */

import * as gateway from '../../../ai/llm/gateway.js';
import * as extractor from './extractor.js';

const SYSTEM_PROMPT =
  '你是一位文明史官。请用 200-500 字为一段已经终结的文明撰写遗产描述，客观、凝练、富有传承意味。';

function str(v) {
  return v == null ? '' : String(v);
}

/** 行动/事件标识 → 中文可读名（遗产正文不应混入内部标识符）。 */
const READABLE = Object.freeze({
  eat: '进食', drink: '饮水', rest: '休息', forage: '采集',
  craft: '制作', build: '建造', write: '著述', work: '劳作',
  trade: '交易', socialize: '交往', court: '求偶', accept: '结为伴侣',
  'agent.death': '居民死亡', 'agent.action.work': '劳作', 'agent.action.craft': '制作',
  'agent.action.build': '建造', 'agent.action.write': '著述', 'agent.action.trade': '交易',
  'agent.action.socialize': '社交往来', 'agent.action.court': '求偶', 'agent.action.accept': '结为伴侣',
  'economy.trade': '市场交易', 'social.procreation': '新生命诞生',
  'social.platform.post': '平台发帖', 'health.epidemic': '疫病流行',
  'health.quarantine': '隔离措施', 'survival.drought': '干旱', 'survival.blight': '枯萎病',
  'survival.storm': '风暴', 'politics.faction.formed': '派系形成', 'politics.leader.elected': '领袖当选',
});

function humanize(id) {
  if (typeof id !== 'string' || id === '') return '';
  if (READABLE[id] !== undefined) return READABLE[id];
  // 未收录的标识符去掉命名空间前缀，保留可读性且不暴露内部路径
  const tail = id.includes('.') ? id.slice(id.lastIndexOf('.') + 1) : id;
  return tail;
}

function summarize(facts) {
  const ev = (facts?.keyEvents ?? []).map((e) => humanize(e.topic)).filter(Boolean).join('、') || '无重大事件';
  const pp = (facts?.keyPeople ?? []).map((p) => p.agentId).filter(Boolean).join('、') || '无突出人物';
  const dd = (facts?.keyDeeds ?? []).map((d) => humanize(d.action)).filter(Boolean).join('、') || '无显著成就';
  return '关键事件：' + ev + '；关键人物：' + pp + '；关键成就：' + dd + '。';
}

/** 把文本约束到 [min, max] 长度区间（超长截断）。 */
export function constrain(input = {}) {
  const text = str(input?.text);
  const min = Number.isInteger(input?.min) && input.min > 0 ? input.min : 200;
  const max = Number.isInteger(input?.max) && input.max >= min ? input.max : 500;
  let out = text;
  let truncated = false;
  if (out.length > max) {
    out = out.slice(0, max);
    truncated = true;
  }
  const length = out.length;
  return { text: out, length, withinRange: length >= min && length <= max, truncated, min, max };
}

function padTo(text, min, facts) {
  let out = text;
  out += '。文明遗产纪要：' + summarize(facts) + '此段文明虽已终结，其遗产将注入下一代文明，供后世传承。';
  while (out.length < min) out += '历史将被铭记，遗产将被继承。';
  return out;
}

/** 生成 200-500 字的文明遗产描述。 */
export async function generate(input = {}) {
  const min = Number.isInteger(input?.min) && input.min > 0 ? input.min : 200;
  const max = Number.isInteger(input?.max) && input.max >= min ? input.max : 500;
  const facts = input?.extract ?? extractor.extract({ graph: input?.graph, civilizationId: input?.civilizationId });

  const resp = await gateway.complete({
    model: input?.model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: '请为以下文明撰写遗产描述。' + summarize(facts) },
    ],
  });

  let c = constrain({ text: resp.text, min, max });
  if (!c.withinRange && c.length < min) {
    c = constrain({ text: padTo(c.text, min, facts), min, max });
  }
  return {
    text: c.text,
    length: c.length,
    withinRange: c.withinRange,
    model: resp.model,
    provider: resp.provider,
    sourceFacts: facts,
  };
}
