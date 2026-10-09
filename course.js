(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = value => value==null?'—':Number(value).toLocaleString('vi-VN',{maximumFractionDigits:1});
  let current=null;
  const dialogs=new Map();
  function dialog(key,title,content,wide=false) {
    let node=dialogs.get(key);
    if(!node) {
      node=document.createElement('dialog');node.className=wide?'leaderboard-dialog course-dialog':'top-participant-dialog course-detail-dialog';
      document.body.appendChild(node);dialogs.set(key,node);
    }
    node.innerHTML=`<header class="presentation-head"><div><span>GIA LAI · TỔNG KẾT KHÓA</span><h2>${esc(title)}</h2></div><button class="presentation-close" type="button" data-close>Đóng ×</button></header><div class="${wide?'leaderboard-dialog-content':'course-detail-content'}">${content}</div>`;
    node.querySelector('[data-close]').onclick=()=>node.close();
    const shown=current;
    node.querySelectorAll('[data-unit]').forEach(button=>button.onclick=()=>openUnit(Number(button.dataset.unit),shown));
    if(!node.open)node.showModal();return node;
  }
  function medal(rank) {
    const leaf='<path d="M27 57 C12 43 11 27 19 9" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M22 53 C12 55 8 48 9 42 C17 43 22 47 22 53 M17 42 C8 43 5 36 7 30 C14 31 18 36 17 42 M15 31 C7 29 6 21 9 17 C15 20 17 26 15 31 M17 20 C11 16 13 8 18 4 C22 10 21 16 17 20 M24 48 C30 43 28 36 24 33 C20 39 20 44 24 48 M20 35 C26 30 25 24 21 20 C17 25 17 31 20 35"/>';
    return `<span class="podium-medal"><svg viewBox="0 0 100 70" aria-hidden="true"><g fill="currentColor">${leaf}<g transform="translate(100 0) scale(-1 1)">${leaf}</g></g><circle cx="50" cy="29" r="24" fill="currentColor"/><text x="50" y="39" text-anchor="middle" fill="white" font-family="Georgia,serif" font-size="32">${rank}</text></svg></span>`;
  }
  function cards(data) {
    const card=(unit,index,featured)=>`<button type="button" class="top-participant-card ${featured?'podium-card course-podium-card':'ranking-card course-ranking-card'} rank-${unit.rank}" data-unit="${index}" aria-label="Xem chi tiết ${esc(unit.unit)}">${featured?medal(unit.rank):`<span class="rank-badge">#${unit.rank}</span>`}<span class="course-unit-name">${esc(unit.unit)}</span><span class="course-total">${number(unit.total)}<small>/100</small></span><span class="course-card-metrics"><span>Thành tích <b>${number(unit.achievement)}</b></span><span>Lượt tham gia <b>${unit.accepted}</b></span></span><span class="course-card-coverage">Có bài ở ${unit.covered}/${unit.totalSessions} phiên</span><span class="podium-cta">Xem chi tiết <b>→</b></span></button>`;
    return `<div class="top-podium" data-count="${Math.min(3,data.top.length)}">${data.top.slice(0,3).map((unit,index)=>card(unit,index,true)).join('')}</div>${data.top.length>3?`<div class="course-runners">${data.top.slice(3).map((unit,index)=>card(unit,index+3,false)).join('')}</div>`:''}`;
  }
  function openUnit(index,shown=current) {
    const unit=shown?.top[index];if(!unit)return;
    const node=dialog('unit',unit.unit,`<div class="course-detail-metrics"><strong>Điểm tổng ${number(unit.total)}/100</strong><span>Thành tích ${number(unit.achievement)}/100</span><span>Điểm tham gia ${number(unit.participation)}/100</span></div><p>${unit.uniqueParticipants} người tham gia · ${unit.accepted} lượt người–phiên hợp lệ</p><h3>Kết quả từng phiên</h3><div class="course-table-wrap"><table class="course-table"><thead><tr><th>Phiên</th><th>Người tham gia không trùng</th><th>Điểm trung bình /100</th></tr></thead><tbody>${unit.sessions.map(session=>`<tr><td>Phiên ${session.id}</td><td>${session.participants}</td><td>${number(session.average)}</td></tr>`).join('')}</tbody></table></div><h3>Học viên có bài được tính</h3><div class="course-people">${unit.people.map((person,i)=>`<button type="button" data-person="${i}"><strong>${esc(person.name)}</strong><span>${person.results.length} phiên · Xem bài làm →</span></button>`).join('')}</div><p class="course-method">Điểm tổng = 70% thành tích + 30% điểm tham gia. Điểm tham gia = lượt hợp lệ / mức lượt cao nhất của các đơn vị × 100. Mỗi người chỉ tính một bài tốt nhất trong từng phiên.</p>`);
    node.querySelectorAll('[data-person]').forEach(button=>button.onclick=()=>openPerson(unit.people[Number(button.dataset.person)]));
  }
  function openPerson(person) {
    if(!person)return;
    dialog('person',person.name,`<p>${esc(person.unit)}</p>${person.results.map(result=>`<section class="course-person-result"><h3>Phiên ${result.sessionId} · ${number(result.points)}/100</h3><p>Nộp sau ${Math.floor(result.durationSeconds/60)} phút ${result.durationSeconds%60} giây từ lúc mở đợt phiên</p>${result.essay?`<blockquote>${esc(result.essay)}</blockquote>`:`<ol>${result.answers.map(answer=>`<li>${typeof answer==='object'?`<strong>${esc(answer.choice)}</strong><p>${esc(answer.explanation)}</p>`:esc(answer)}</li>`).join('')}</ol>`}</section>`).join('')}`);
  }
  function render(root,data,options={}) {
    if(current && data && (data.status==='WAITING_RECHOT' || JSON.stringify(current.includedSessions)!==JSON.stringify(data.includedSessions))) {
      Array.from(dialogs.values()).reverse().forEach(node=>{if(node.open)node.close();});
    }
    current=data;
    const label=data?.status==='OFFICIAL'?'Chính thức':data?.status==='WAITING_RECHOT'?'Chờ chốt lại':'Tạm thời';
    root.dataset.kind='course';root.dataset.phase='course';
    const admin=options.adminUrl?`${options.adminUrl}${options.adminUrl.includes('?')?'&':'?'}admin=1&view=course&email=${encodeURIComponent(options.email||'')}`:'';
    root.innerHTML=`<section class="section-head"><div><p class="section-kicker">TỔNG KẾT KHÓA</p><h2>Đơn vị tích cực và đạt thành tích cao</h2></div><span class="phase-pill">${label}</span></section><section class="panel course-intro"><p><strong>Tính trên ${data?.includedSessions?.length||0} phiên</strong>${data?.includedSessions?.length?`: ${data.includedSessions.map(id=>'Phiên '+id).join(', ')}`:''}</p><p>70% thành tích + 30% mức tham gia. Mỗi người–mỗi phiên chỉ tính một lần.</p>${data?.publishedAt?`<p>Công bố: ${esc(new Date(data.publishedAt).toLocaleString('vi-VN'))}</p>`:''}${data?.status==='WAITING_RECHOT'?'<p class="course-warning">Một phiên đã Reset hoặc Mở lại. Kết quả cũ đã rút khỏi công bố; cần chốt và công bố lại.</p>':''}${data?.unresolved?`<p class="course-warning">${data.unresolved} trường hợp cần đối chiếu. Thứ hạng hiện chưa phải kết quả chính thức.</p>`:''}${data?.choices?.some(choice=>choice.phase==='CLOSED'&&choice.pending)?`<p class="course-warning">Còn phiên chờ chấm: ${data.choices.filter(choice=>choice.phase==='CLOSED'&&choice.pending).map(choice=>'Phiên '+choice.id).join(', ')}.</p>`:''}${data?.error?`<p class="course-warning">${esc(data.error)}</p>`:''}${admin?`<a class="button button-admin" href="${esc(admin)}" target="_blank" rel="noopener">Đối chiếu và công bố tổng kết</a>`:''}</section>${options.loading&&!data?'<div class="loading-panel">Đang tổng hợp đơn vị…</div>':data?.top?.length?`<section class="leaderboard panel top-participants-panel course-leaderboard"><div class="leaderboard-heading"><div><p class="panel-kicker">VINH DANH ĐƠN VỊ</p><h3>Top 5 cuối khóa</h3></div><button class="presentation-trigger" data-full type="button">Chiếu Top 5 toàn màn hình ↗</button></div>${cards(data)}${data.top.length>5?'<p>Có đơn vị đồng hạng tại ngưỡng Top 5.</p>':''}</section>`:'<div class="empty">Chưa có đơn vị đủ điều kiện. Cần phiên đã chốt có kết quả và đơn vị có bài ở ít nhất 80% số phiên được tính.</div>'}<details class="panel course-method"><summary>Cách tính và các phiên chưa được đưa vào tổng kết</summary><p>Điểm thành tích là trung bình điểm từng phiên trên thang 100; phiên không có bài của đơn vị tính 0. Điểm tham gia = lượt người–phiên hợp lệ của đơn vị / số lượt cao nhất trong các đơn vị × 100; không dùng danh sách đăng ký. Có thể lợi thế cho đơn vị đông người. Phiên 6 dùng điểm lựa chọn Đúng/Sai.</p>${data?.choices?`<ul>${data.choices.filter(choice=>!data.includedSessions.includes(choice.id)).map(choice=>`<li>Phiên ${choice.id}: ${choice.phase!=='CLOSED'?'chưa chốt':!choice.count?'chưa có bài hợp lệ':choice.pending?'chờ chấm đủ':'không được chọn khi công bố'}</li>`).join('')}</ul>`:''}</details>`;
    root.querySelectorAll('[data-unit]').forEach(button=>button.onclick=()=>openUnit(Number(button.dataset.unit)));
    const full=root.querySelector('[data-full]');if(full)full.onclick=()=>dialog('full',`Top 5 đơn vị · ${label}`,`<p class="leaderboard-presentation-note">Tính trên ${data.includedSessions.length} phiên</p>${cards(data)}`,true);
  }
  function demo() {
    return {version:1,status:'TEMPORARY',rosterConfirmed:true,includedSessions:[1,2,3,4,5],choices:[],unresolved:0,
      top:Array.from({length:5},(_,i)=>({rank:i+1,unit:['Phường Minh họa A','Xã Minh họa B','Phường Minh họa C','Xã Minh họa D','Xã Minh họa E'][i],total:92-i*4,achievement:90-i*4,participation:96-i*4,covered:5,totalSessions:5,uniqueParticipants:4,participationMax:19,accepted:19-i,sessions:[1,2,3,4,5].map(id=>({id,participants:4,average:90-i*4})),people:[{id:'demo',name:'Học viên minh họa',unit:'Đơn vị minh họa',results:[{sessionId:1,points:100,durationSeconds:120,answers:['3,5,1,6,4,11,9,8,10,13,2,12,7']}]}]}))};
  }
  window.GiaLaiCourse={render,demo};
})();
