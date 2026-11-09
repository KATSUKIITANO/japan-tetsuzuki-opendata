// 相続の期限カレンダー：亡くなった日から、手続きごとの期限日を出す（すべて端末の中で計算。送信しない）
// 期限のルールは koyomi/RULES.md（e-Gov法令・法務省・国税庁・年金機構などで確認した表）による
const $ = id => document.getElementById(id);
const W = '日月火水木金土';
const D = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const K = t => t.toISOString().slice(0, 10);
const A = (t, n) => new Date(t.getTime() + n * 864e5);
const PD = v => { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? D(+m[1], +m[2], +m[3]) : null; };
const FD = t => `${t.getUTCMonth() + 1}月${t.getUTCDate()}日（${W[t.getUTCDay()]}）`;
const FY = t => `${t.getUTCFullYear()}年`;
// 民法143条の応当日：nか月後の同じ日。その日がなければ月末（国税庁の例 1/6→11/6、12/1→4/1 と一致）
function addM(t, n) { const y = t.getUTCFullYear(), m = t.getUTCMonth() + n, d = t.getUTCDate(); const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); return new Date(Date.UTC(y, m, Math.min(d, last))); }
const addY = (t, n) => addM(t, n * 12);

// 祝日（内閣府の祝日法による。春分・秋分は1980〜2099年の計算式）
const HC = {};
function MON(y, m, n) { const f = D(y, m, 1).getUTCDay(); return D(y, m, 1 + (8 - f) % 7 + (n - 1) * 7); }
function HOL(y) {
  if (HC[y]) return HC[y];
  const h = {}, s = (t, n) => h[K(t)] = n, q = Math.floor((y - 1980) / 4);
  s(D(y, 1, 1), '元日'); s(MON(y, 1, 2), '成人の日'); s(D(y, 2, 11), '建国記念の日');
  if (y >= 2020) s(D(y, 2, 23), '天皇誕生日');
  s(D(y, 3, Math.floor(20.8431 + 0.242194 * (y - 1980) - q)), '春分の日');
  s(D(y, 4, 29), '昭和の日'); s(D(y, 5, 3), '憲法記念日'); s(D(y, 5, 4), 'みどりの日'); s(D(y, 5, 5), 'こどもの日');
  s(MON(y, 7, 3), '海の日'); s(D(y, 8, 11), '山の日'); s(MON(y, 9, 3), '敬老の日');
  s(D(y, 9, Math.floor(23.2488 + 0.242194 * (y - 1980) - q)), '秋分の日');
  s(MON(y, 10, 2), 'スポーツの日'); s(D(y, 11, 3), '文化の日'); s(D(y, 11, 23), '勤労感謝の日');
  const b = Object.assign({}, h);
  for (let t = D(y, 1, 2); t < D(y, 12, 31); t = A(t, 1)) { const c = K(t); if (!b[c] && b[K(A(t, -1))] && b[K(A(t, 1))]) h[c] = '国民の休日'; }
  Object.keys(b).forEach(c => { let t = PD(c); if (t.getUTCDay() === 0) { do t = A(t, 1); while (h[K(t)]); h[K(t)] = '振替休日'; } });
  return HC[y] = h;
}
// 役所・税務署が閉まっている日（土日・祝日・12/29〜1/3）
function closed(t) {
  const w = t.getUTCDay(), m = t.getUTCMonth() + 1, d = t.getUTCDate();
  if (w === 0 || w === 6) return w === 0 ? '日曜' : '土曜';
  if ((m === 12 && d >= 29) || (m === 1 && d <= 3)) return '年末年始';
  return HOL(t.getUTCFullYear())[K(t)] || '';
}
// 期限が閉庁日なら翌開庁日まで（国税通則法10条2項・地方自治法4条の2第4項・行政機関休日法2条）
function nextOpen(t) { let x = t, g = 0; while (closed(x) && g++ < 20) x = A(x, 1); return x; }
// 民法上の期間（相続放棄など）は自動では延びないので、休日なら直前の開庁日を「動ける最終日」として示す
function prevOpen(t) { let x = t, g = 0; while (closed(x) && g++ < 20) x = A(x, -1); return x; }

const LAW = id => `https://laws.e-gov.go.jp/law/${id}`;
// kind: gov=役所への届出（閉庁日なら翌開庁日）／tax=国税（休日なら翌日）／civil=民法などの期間（休日でも延びない）／info=目安
function items(o) {
  const d = o.d, k = o.k, out = [];
  const add = (key, title, due, kind, where, todo, src, extra) => out.push(Object.assign({ key, title, due, kind, where, todo, src }, extra || {}));
  add('shibou', '死亡届の提出（火葬の許可もあわせて）', A(k, 6), 'shibou', '亡くなった場所・本籍地・届出人の住所地の市区町村役場',
    '死亡診断書と一緒に出します。葬儀社が代わりに出すことも多い手続きです。火葬は亡くなってから24時間たった後でないとできません。',
    [['戸籍法86条（7日以内）・43条（初日を含めて数える）', LAW('322AC0000000224')]], { rule: '死亡を知った日から7日以内（その日を含めて数える）' });
  if (o.pension === 'unknown')
    add('nenkin', '年金を止める手続き（受給権者死亡届）', A(d, 9), 'gov', '厚生年金：年金事務所・街角の年金相談センター／国民年金だけの方：市区町村役場',
      '厚生年金は10日以内、国民年金は14日以内です。種類が分からないときは、早い方（厚生年金の10日）に合わせて表示しています。どちらか一方の手続きで足ります。年金証書や振込通知書で種類が分かります。日本年金機構にマイナンバーが登録されている方は、原則として届出は不要です。',
      [['厚生年金保険法98条（10日以内）', LAW('329AC0000000115')], ['国民年金法105条（14日以内）', LAW('334AC0000000141')], ['日本年金機構', 'https://www.nenkin.go.jp/service/jukyu/tetsuduki/kyotsu/jukyu/20140731-01.html']], { rule: '厚生年金は10日以内・国民年金は14日以内（ここでは安全のため1日早く表示）' });
  if (o.pension === 'kosei')
    add('nenkin-k', '年金を止める手続き（厚生年金の受給権者死亡届）', A(d, 9), 'gov', '年金事務所・街角の年金相談センター',
      '日本年金機構にマイナンバーが登録されている方は、原則として届出は不要です。受け取りすぎた年金は返す必要があるので、早めに確認しましょう。',
      [['厚生年金保険法98条（10日以内）', LAW('329AC0000000115')], ['日本年金機構', 'https://www.nenkin.go.jp/service/jukyu/tetsuduki/kyotsu/jukyu/20140731-01.html']], { rule: '10日以内（ここでは安全のため1日早く表示）' });
  if (o.pension === 'kokumin')
    add('nenkin-n', '年金を止める手続き（国民年金の受給権者死亡届）', A(d, 13), 'gov', '市区町村役場・年金事務所',
      'マイナンバーが登録されている方は、原則として届出は不要です。',
      [['国民年金法105条（14日以内）', LAW('334AC0000000141')]], { rule: '14日以内（ここでは安全のため1日早く表示）' });
  if (o.employee)
    add('kenpo', '勤務先への連絡（健康保険の資格喪失）', A(d, 4), 'info', '亡くなった方の勤務先',
      '手続きは勤務先が行います（事業主が5日以内）。保険証の返却や、最後の給与・退職金について確認しましょう。',
      [['日本年金機構（資格喪失届）', 'https://www.nenkin.go.jp/service/kounen/tekiyo/hihokensha1/20150407-02.html']], { rule: '勤務先が5日以内に手続き' });
  if (o.kokuho)
    add('kokuho', '国民健康保険・介護保険の資格喪失', A(d, 13), 'gov', '市区町村役場',
      '保険証や介護保険証を返します。死亡届を出せば手続きが済む自治体もあるので、役場で確認しましょう。',
      [['介護保険法施行規則32条（14日以内）', 'https://laws.e-gov.go.jp/law/411M50000100036']], { rule: '14日以内（ここでは安全のため1日早く表示）' });
  if (o.setai)
    add('setai', '世帯主の変更届', A(d, 13), 'gov', '市区町村役場',
      '亡くなった方が世帯主で、残った世帯に15歳以上の人が2人以上いる場合に必要です（1人だけなら不要）。',
      [['住民基本台帳法25条（14日以内）', LAW('342AC0000000081')]], { rule: '14日以内（ここでは安全のため1日早く表示）' });
  add('houki', '相続放棄・限定承認をするかの判断（熟慮期間）', addM(k, 3), 'civil', '亡くなった方の最後の住所地の家庭裁判所',
    '借金などマイナスの財産が多いときは、相続放棄を考えます。間に合わないときは、期限内に家庭裁判所へ期間の延長（伸長）を申し立てられます。何もしないと、すべてを相続したことになります。',
    [['民法915条（3か月以内）', LAW('129AC0000000089')], ['裁判所：相続の放棄の申述', 'https://www.courts.go.jp/saiban/syurui/syurui_kazi/kazi_06_13/index.html'], ['裁判所：期間の伸長', 'https://www.courts.go.jp/saiban/syurui/syurui_kazi/kazi_06_25/index.html']], { rule: '相続が始まったことを知った時から3か月以内' });
  add('junkakutei', '準確定申告（亡くなった方の所得税の申告・納付）', addM(k, 4), 'tax', '亡くなった方の住所地の税務署',
    '亡くなった年の1月1日から亡くなった日までの所得を申告します。公的年金が400万円以下で他の所得が20万円以下など、申告が要らない場合もあります。',
    [['所得税法124・125条（4か月以内）', LAW('340AC0000000033')], ['国税庁 No.2022', 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2022.htm']], { rule: '相続の開始を知った日の翌日から4か月以内' });
  if (o.zei)
    add('souzokuzei', '相続税の申告・納付', addM(k, 10), 'tax', '亡くなった方の住所地の税務署',
      '遺産の合計が「3,000万円＋600万円×法定相続人の数」を超えると、申告が必要になる目安です。特例を使って税額が0円になる場合も、申告が必要なことがあります。' + '<br>相続人が2人以上いるときは、遺産分割協議書が必要になることが多い手続きです。<a href="kyogisho">→ 協議書を作る（見本は無料）</a>',
      [['相続税法27・33条（10か月以内）', LAW('325AC0000000073')], ['国税庁 No.4205', 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/sozoku/4205.htm']], { rule: '相続の開始を知った日の翌日から10か月以内' });
  if (o.fudosan) {
    // 法務省Q&A：2024年4月1日より前（過料の説明では「以前」）に知った相続は2027年3月31日まで。基準は亡くなった日ではなく知った日（附則5条6項：知った日と施行日の遅い方から3年）
    const before = K(k) <= '2024-04-01';
    add('touki', '相続登記（不動産の名義変更）の申請', before ? D(2027, 3, 31) : addY(k, 3), 'gov', '不動産の所在地を管轄する法務局',
      (K(d) < '2024-04-01' ? '2024年4月1日より前に始まった相続も、登記が義務になりました。' : '') + '遺産分割で不動産を取得した場合は、分割の日から3年以内に申請します。正当な理由なく申請しないと、10万円以下の過料の対象になります。' + '<br>相続人が2人以上いるときは、遺産分割協議書が必要になることが多い手続きです。<a href="kyogisho">→ 協議書を作る（見本は無料）</a>',
      [['不動産登記法76条の2（3年以内）', LAW('416AC0000000123')], ['法務省：相続登記の申請義務化', 'https://www.moj.go.jp/MINJI/minji05_00565.html']],
      { rule: before ? '2024年4月1日より前に相続を知った場合は2027年3月31日まで' : '取得を知った日から3年以内' });
  }
  if (o.hoken)
    add('hoken', '生命保険の死亡保険金の請求', addY(d, 3), 'info', '加入している保険会社',
      '法律上の時効の目安です。保険会社の約款で決まっているので、証券を見て早めに連絡しましょう。',
      [['保険法95条（3年）', LAW('420AC0000000056')]], { rule: '3年（約款による）' });
  if (o.kokuho) add('sousaihi', '葬祭費の請求（国民健康保険）', addY(o.f || d, 2), 'info', '市区町村役場',
    '葬儀を行った人（喪主）が受け取れます。金額は自治体ごとに決まっています（例：5万円・7万円）。' + (o.f ? '' : '葬儀の日を入れると、より正確な期限が出ます。'),
    [['国民健康保険法58条・110条', LAW('333AC0000000192')]], { rule: '葬儀を行った日の翌日から2年' });
  if (o.employee) add('maisou', '埋葬料の請求（会社の健康保険）', addY(d, 2), 'info', '勤務先の健康保険（協会けんぽ・健康保険組合）',
    '生計を同じくしていて埋葬を行った家族が受け取れます（協会けんぽは5万円）。',
    [['健康保険法100条・193条', LAW('211AC0000000070')], ['協会けんぽ', 'https://www.kyoukaikenpo.or.jp/application_form/benefit/012/index.html']], { rule: '亡くなった日の翌日から2年' });
  if (o.pension !== 'none') add('izoku', '遺族年金の請求', addY(d, 5), 'info', '年金事務所・市区町村役場',
    '受け取れるかどうかは、亡くなった方の年金の加入状況と家族の状況で決まります。まず年金事務所に相談しましょう。未支給の年金があれば一緒に請求します。',
    [['国民年金法102条・厚生年金保険法92条（5年）', 'https://www.nenkin.go.jp/service/jukyu/seido/kyotsu/shikyu/20140421-01.html']], { rule: '5年' });
  if (o.yuigon) add('iryubun', '遺留分（最低限の取り分）を求める期限', addY(k, 1), 'civil', '相手方（多くは弁護士に相談）',
    '遺言や生前の贈与で、自分の取り分が法律で守られた分より少なくなったと知った時から1年です（ここでは亡くなったと知った日から数えた目安）。',
    [['民法1048条', LAW('129AC0000000089')]], { rule: '侵害を知った時から1年（相続開始から10年）' });
  return out;
}

function plan(o) {
  return items(o).map(it => {
    let date = it.due, shift = '';
    const c = closed(it.due);
    if (c && (it.kind === 'gov' || it.kind === 'tax')) { date = nextOpen(it.due); shift = `本来の期限 ${FD(it.due)} が${c}のため、翌開庁日まで`; }
    else if (c && it.kind === 'civil') { date = prevOpen(it.due); shift = `法律上の末日 ${FD(it.due)} は${c}です。延びるかどうかは確実ではないので、前の平日のこの日までに動きましょう`; }
    return Object.assign({}, it, { date, shift });
  }).sort((a, b) => a.date - b.date);
}

// ---------- 画面 ----------
const SITE = 'https://souzoku-koyomi.com/kigen';
const today = () => { const n = new Date(Date.now() + 9 * 36e5); return D(n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate()); };
const CHECKS = ['employee', 'kokuho', 'setai', 'fudosan', 'zei', 'hoken', 'yuigon'];
let LAST = [];
// 入力が妥当な日付か（年の途中入力や遠い未来・過去は無視する）
function okDate(t) { if (!t) return null; const y = t.getUTCFullYear(); return y >= 1990 && t <= A(today(), 366) ? t : null; }
function opts() {
  const d = okDate(PD($('d').value)); if (!d) return null;
  const k = $('k_on').checked ? (okDate(PD($('k').value)) || d) : d;
  const o = { d, k, f: okDate(PD($('f').value)), pension: (document.querySelector('input[name=pension]:checked') || {}).value || 'unknown' };
  CHECKS.forEach(c => o[c === 'zei' ? 'zei' : c] = $(c).checked);
  return o;
}
// 入力をURLに残す（再読み込み・家族への共有・あとで見返す用。サーバーには送らない）
function saveHash() {
  const o = opts(); if (!o) return;
  const q = new URLSearchParams({ d: K(o.d) });
  if ($('k_on').checked) q.set('k', K(o.k)); if (o.f) q.set('f', K(o.f));
  q.set('p', o.pension); q.set('c', CHECKS.filter(c => $(c).checked).join(','));
  history.replaceState(null, '', '#' + q.toString());
}
// 協議書のページの料金欄に「いちばん近い期限まであと○日」を出すため、亡くなった日と4つの期限日（この画面と同じ計算）だけを端末の中に残す（送信しない。協議書のページから消せる）
const NEXT4 = { houki: '相続放棄（3か月）', junkakutei: '準確定申告（4か月）', souzokuzei: '相続税の申告（10か月）', touki: '相続登記（3年）' };
function saveLocal(o) {
  try { const l = plan(Object.assign({}, o, { fudosan: true, zei: true })).filter(x => NEXT4[x.key]);
    if (l.length) localStorage.setItem('koyomi_kigen', JSON.stringify({ d: K(o.d), next: l.map(x => ({ k: x.key, t: NEXT4[x.key], date: K(x.date) })) })); } catch (e) {}
}
function loadHash() {
  const q = new URLSearchParams(location.hash.slice(1)); if (!q.get('d')) return;
  $('d').value = q.get('d'); if (q.get('k')) { $('k_on').checked = true; $('k_box').hidden = false; $('k').value = q.get('k'); }
  if (q.get('f')) $('f').value = q.get('f');
  const p = document.querySelector(`input[name=pension][value="${q.get('p')}"]`); if (p) p.checked = true;
  if (q.has('c')) { const c = q.get('c').split(','); CHECKS.forEach(x => $(x).checked = c.includes(x)); }
}
const doneKey = (o, key) => `koyomi_done_${K(o.d)}_${key}`;
const isDone = (o, key) => { try { return localStorage.getItem(doneKey(o, key)) === '1'; } catch (e) { return false; } };
const PILL = { shibou: '<span class="pill">休日・夜間も受付（火葬の許可のため早めに）</span>', civil: '<span class="pill shu">延びるとは限らない期限</span>',
  info: '<span class="pill">目安</span>', gov: '<span class="pill">閉庁日なら翌開庁日</span>', tax: '<span class="pill">休日なら翌日</span>' };
function card(o, it, t0) {
  const l = Math.round((it.date - t0) / 864e5), done = isDone(o, it.key);
  const cls = ['item', l < 0 ? 'past' : l <= 14 ? 'soon' : '', done ? 'done' : ''].join(' ');
  const wide = typeof innerWidth === 'number' && innerWidth > 760;
  const ext = it.key === 'houki' && l >= 0 && l <= 14 ? '<p class="shift">間に合わないときは、期限内に家庭裁判所へ「期間の伸長」を申し立てられます（下の根拠のリンク）。</p>' : '';
  return `<li class="${cls}"><div class="when"><span class="y">${FY(it.date)}</span><span class="d">${FD(it.date)}</span><span class="left">${l < 0 ? `${-l}日前に過ぎた` : l === 0 ? '今日まで' : `あと${l}日`}</span></div>
<div class="body"><h3>${it.title}</h3><p class="meta">${PILL[it.kind]}${it.rule}</p>${it.shift ? `<p class="shift">${it.shift}</p>` : ''}${ext}
<details class="more"${wide ? ' open' : ''}><summary>やること・窓口・根拠</summary><p>${it.todo}</p>
<p class="meta">窓口：${it.where}<br>根拠：${it.src.map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener">${n}</a>`).join('、')}</p></details>
<label class="done-l no-print"><input type="checkbox" data-key="${it.key}" ${done ? 'checked' : ''}> 済んだ</label></div></li>`;
}
function nextSteps(o, list) {
  // 協議書を主役に（期限という事実と結びつける）。公式の解説は下に参考として置く
  const f = k => { const it = (list || []).find(x => x.key === k); return it ? `${FY(it.date)}${FD(it.date)}` : ''; };
  const dl = [o.fudosan && f('touki') ? `相続登記（${f('touki')}まで）` : '', o.zei && f('souzokuzei') ? `相続税の申告（${f('souzokuzei')}まで）` : ''].filter(Boolean);
  // 法定相続分（無料）→ 協議書（見本は無料・架空の例で出来上がりを先に見られる）。bun と同じ形の2枚
  const bun = `<a class="tool-card" href="bun" data-cta="next-bun"><span class="tag">無料</span><b>誰が、何分の1を相続する？</b><p>家族の構成を選ぶと、誰が相続人になり、それぞれ何分の1かが分かります。代襲相続・相続放棄にも対応。</p><span class="go">相続分を調べる（無料）→</span></a>`;
  const own = `<a class="tool-card main" href="kyogisho?sample=1" data-cta="next-kyogisho"><span class="tag">見本は無料</span><b>遺産分割協議書を作る</b><p>相続人が2人以上いるとき、${dl.length ? `${dl.join('・')}の手続きで` : '名義変更や解約の手続きで'}必要になることが多い書類です。見本は無料で、架空の例で出来上がりを先に見られます。質問に答えて作り、見本で確かめてから保存できます（保存は4,980円から・買い切り）。</p><span class="go">架空の例で出来上がりを見る（無料）→</span></a>`;
  const refs = [['相続人の範囲と法定相続分（国税庁）', 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/sozoku/4132.htm']];
  if (o.fudosan) refs.push(['相続登記の申請義務化（法務省）', 'https://www.moj.go.jp/MINJI/minji05_00565.html']);
  if (o.zei) refs.push(['相続税の計算（国税庁）', 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/sozoku/4152.htm']);
  return '<h2>次の一歩</h2><div class="next2 kg">' + bun + own + '</div><p class="refs">参考（公式の解説）：' + refs.map(([t, u]) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`).join('　') + '</p>';
}
function render() {
  const out = $('out'), raw = PD($('d').value);
  if (raw && raw > today()) { out.innerHTML = '<div class="alert shu">亡くなった日に、未来の日付が入っています。日付を確かめてください。</div>'; $('acts').hidden = true; return; }
  const o = opts();
  if (!o) { out.innerHTML = '<p class="note">亡くなった日を入れると、ここに期限の一覧が出ます。</p>'; $('acts').hidden = true; return; }
  if (o.k < o.d) { out.innerHTML = '<div class="alert shu">「知った日」は、亡くなった日と同じか、それより後の日を入れてください。</div>'; return; }
  saveHash(); saveLocal(o);
  const t0 = today(), list = plan(o); LAST = list;
  const left = it => Math.round((it.date - t0) / 864e5);
  const past = list.filter(it => left(it) < 0), now = list.filter(it => left(it) >= 0);
  const nxt = now[0], soon = now.filter(it => left(it) <= 14).length;
  let h = `<p class="premise">前提：亡くなった日 <b>${FY(o.d)}${FD(o.d)}</b>（知った日 ${K(o.k) === K(o.d) ? '同じ日' : FY(o.k) + FD(o.k)}）　／　${FY(t0)}${FD(t0)} 作成・2026年10月15日時点の法令で計算</p>`;
  $('status').textContent = nxt ? `いちばん近い期限は ${FY(nxt.date)}${FD(nxt.date)}、あと${left(nxt)}日の「${nxt.title}」です。` : '';
  if (nxt) h += `<div class="alert ${left(nxt) <= 14 ? 'shu' : 'ok'}">いちばん近い期限は <b>${FY(nxt.date)}${FD(nxt.date)}</b>（あと${left(nxt)}日）の「${nxt.title}」です。${soon > 1 ? `2週間以内の期限がほかに${soon - 1}件あります。` : ''}${past.length ? `<br><span class="note">期限が過ぎた手続きが${past.length}件ありますが、多くは今からでも手続きできます。</span>` : ''}</div>`;
  if (o.fudosan && K(o.k) <= '2024-04-01') h += '<p class="note k1line">相続登記：2024年4月1日（義務化の施行日）より前に相続を知った不動産で、まだ登記していないものは、期限が<b>2027年3月31日</b>です（<a href="souzoku-touki-gimuka">法務省Q&Aにもとづく解説</a>）。不動産を相続したことを後から知った場合は、その知った日から3年以内です。</p>';
  else if (o.fudosan && K(o.d) < '2024-04-01') h += '<p class="note k1line">相続登記：相続が始まったのは2024年4月1日より前ですが、知ったのがそれより後なので、期限は相続と不動産の取得を知った日から3年以内です（<a href="souzoku-touki-gimuka">解説</a>）。</p>';
  if (past.length) h += `<details class="pastbox"><summary>期限が過ぎた ${past.length} 件を表示</summary><ol class="koyomi">${past.map(it => card(o, it, t0)).join('')}</ol></details>`;
  h += `<ol class="koyomi">${now.map(it => card(o, it, t0)).join('')}</ol>`;
  h += nextSteps(o, list);
  if (typeof prBox === 'function') h += prBox(o.fudosan ? 'touki' : 'main');
  out.innerHTML = h; if (typeof prWire === 'function') prWire(out);
  out.querySelectorAll('input[data-key]').forEach(c => c.addEventListener('change', () => { try { localStorage.setItem(doneKey(o, c.dataset.key), c.checked ? '1' : '0'); } catch (e) {} c.closest('.item').classList.toggle('done', c.checked); }));
  $('acts').hidden = false;
}
function ics() {
  const o = opts(); if (!o || !LAST.length) return;
  const esc = s => String(s).replace(/[\\,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const ymd = t => K(t).replace(/-/g, '');
  const url = SITE + location.hash;
  const ev = LAST.filter(it => it.date >= today()).map(it => ['BEGIN:VEVENT', `UID:koyomi-${ymd(o.d)}-${it.key}@souzoku-koyomi.com`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${ymd(it.date)}`, `DTEND;VALUE=DATE:${ymd(A(it.date, 1))}`, `SUMMARY:${esc('【相続の期限】' + it.title)}`,
    `DESCRIPTION:${esc(it.rule + (it.shift ? '\n' + it.shift : '') + '\n窓口：' + it.where + '\n' + it.todo + '\n（目安です。窓口で確認してください）\n' + url)}`, `URL:${url}`,
    'BEGIN:VALARM', 'TRIGGER:-P7D', 'ACTION:DISPLAY', `DESCRIPTION:${esc('あと7日：' + it.title)}`, 'END:VALARM', 'END:VEVENT'].join('\r\n'));
  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//souzoku-koyomi//kigen//JA', 'CALSCALE:GREGORIAN', ...ev, 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type: 'text/calendar' })); a.download = '相続の期限.ics'; a.click();
}
async function share() {
  saveHash(); const url = location.href;
  try { if (navigator.share) { await navigator.share({ title: '相続の期限', url }); return; } await navigator.clipboard.writeText(url); $('share').textContent = 'リンクをコピーしました'; }
  catch (e) {}
}
if (typeof document !== 'undefined' && document.getElementById('d')) {
  loadHash();
  document.querySelectorAll('#form input').forEach(el => { el.addEventListener('change', render); if (el.type === 'date') el.addEventListener('input', render); });
  $('k_on').addEventListener('change', () => { $('k_box').hidden = !$('k_on').checked; render(); });
  $('ics').addEventListener('click', ics);
  $('print').addEventListener('click', () => { document.querySelectorAll('details.more,details.pastbox').forEach(d => d.open = true); window.print(); });
  $('share').addEventListener('click', share);
  render();
}

if (typeof module !== 'undefined') module.exports = { addM, addY, closed, nextOpen, prevOpen, plan, items, D, K, HOL };
