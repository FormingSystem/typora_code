// 两个真实 renderer/频道反复交接；文档端口替身，真实文档另由 document_transfer 用例覆盖。
module.exports = async ({open, evaluate, evidence}) => {
  const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
  const pair = [await open(), await open()];
  const report = {tiers: [], renderer_count: 2, document_boundary: 'fixture ports; real BroadcastChannel and production transfer controller'};
  for (const win of pair) await evaluate(win, `
    binding.dispose();
    window.active_channels=new Set();window.active_timers=new Set();window.message_counts={};
    window.original_timeout=window.setTimeout.bind(window);window.original_interval=window.setInterval.bind(window);
    window.original_clear_timeout=window.clearTimeout.bind(window);window.original_clear_interval=window.clearInterval.bind(window);
    window.setTimeout=(callback,ms,...args)=>{let id=original_timeout(()=>{active_timers.delete(id);callback(...args)},ms);active_timers.add(id);return id;};
    window.setInterval=(callback,ms,...args)=>{let id=original_interval(callback,ms,...args);active_timers.add(id);return id;};
    window.clearTimeout=id=>{active_timers.delete(id);original_clear_timeout(id);};
    window.clearInterval=id=>{active_timers.delete(id);original_clear_interval(id);};
    install('',1800,{channel:name=>{const channel=new BroadcastChannel(name);active_channels.add(channel);
      const close=channel.close.bind(channel),post=channel.postMessage.bind(channel);
      channel.close=()=>{active_channels.delete(channel);close();};
      channel.postMessage=message=>{message_counts[message.kind]=(message_counts[message.kind]||0)+1;post(message);};return channel;}});
    window.settled=async()=>{for(let i=0;i<1000;i++){if(!active_channels.size&&!active_timers.size)return;await new Promise(resolve=>original_timeout(resolve,2));}throw Error('transfer resources remain');};void 0;
  `);
  let completed = 0;
  for (const rounds of [20, 100, 1000]) {
    const times = [], started = performance.now();
    for (let i = 0; i < rounds; i++) {
      const source = pair[i % 2], target = pair[(i + 1) % 2], start = performance.now();
      const token = await evaluate(source, 'start_drag()');
      await evaluate(target, `document.dispatchEvent(new CustomEvent('typora-code:tab-drop',{cancelable:true,detail:{transfer_token:${JSON.stringify(token)},target_group:leaf.parent,target_index:0}}));void 0`);
      await evaluate(source, "end_drag({drop_effect:'move'});settled()");
      await evaluate(target, 'settled()');
      times.push(performance.now() - start); completed++;
    }
    const states = await Promise.all(pair.map(win => evaluate(win, '({channels:active_channels.size,timers:active_timers.size,releases,received:received.length,messages:message_counts,notices})')));
    assert.equal(states.reduce((sum, state) => sum + state.releases, 0), completed);
    assert.equal(states.reduce((sum, state) => sum + state.received, 0), completed);
    for (const state of states) { assert.equal(state.channels, 0); assert.equal(state.timers, 0); assert.deepEqual(state.notices, []); }
    for (const kind of ['payload', 'accepted', 'committed']) assert.equal(states.reduce((sum, state) => sum + (state.messages[kind] || 0), 0), completed);
    times.sort((a, b) => a - b);
    report.tiers.push({rounds, elapsed_ms: performance.now() - started, max_transfer_ms: times.at(-1), p95_transfer_ms: times[Math.floor(rounds * .95)], states});
  }
  for (const win of pair) {
    await evaluate(win, `for(let i=0;i<1000;i++){start_drag();end_drag({cancelled:true});}binding.dispose();void 0`);
    assert.deepEqual(await evaluate(win, '[active_channels.size,active_timers.size,notices.length]'), [0,0,0]);
  }
  report.cancelled = 2000;
  fs.writeFileSync(path.join(evidence, 'stress.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({transfer_stress: report, evidence}));
};
