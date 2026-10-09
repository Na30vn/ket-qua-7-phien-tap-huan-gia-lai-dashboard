(() => {
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let selected='2026-10-10',slide,ownsFullscreen=false,query='',missingOpen=false;
  function leaveFullscreen(){if(ownsFullscreen&&document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});ownsFullscreen=false;}
  function close(){if(slide?.open)slide.close();leaveFullscreen();}
  function loadImage(src){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Không tải được ảnh QR/logo'));image.src=src;});}
  function wrapSlideText(ctx,text,maxWidth){
    const lines=[];let line='';
    for(const word of text.split(/\s+/)){const next=line?line+' '+word:word;if(line&&ctx.measureText(next).width>maxWidth){lines.push(line);line=word;}else line=next;}
    if(line)lines.push(line);return lines;
  }
  async function downloadSlide(day,course,button){
    button.disabled=true;button.textContent='Đang tạo ảnh…';
    try{
      const [logo,qr]=await Promise.all([loadImage('assets/logo-kiem-toan-nha-nuoc.jpg'),loadImage(`assets/qr/attendance-${day.day}.png`)]);
      const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;
      const ctx=canvas.getContext('2d'),gradient=ctx.createLinearGradient(0,0,1920,1080);
      gradient.addColorStop(0,'#f3f8fd');gradient.addColorStop(.55,'#ffffff');gradient.addColorStop(1,'#e4eef8');ctx.fillStyle=gradient;ctx.fillRect(0,0,1920,1080);
      ctx.textAlign='center';ctx.fillStyle='#123b62';ctx.drawImage(logo,660,25,80,80);
      ctx.font='700 28px Arial';ctx.fillText('KIỂM TOÁN NHÀ NƯỚC',1010,48);
      ctx.font='700 22px Arial';ctx.fillText('TRƯỜNG ĐÀO TẠO VÀ BỒI DƯỠNG',1010,80);ctx.fillText('NGHIỆP VỤ KIỂM TOÁN',1010,107);
      ctx.fillStyle='#a76b10';ctx.font='700 22px Arial';ctx.fillText('KHÓA ĐÀO TẠO',960,150);
      ctx.fillStyle='#123b62';ctx.font='700 42px Arial';const lines=wrapSlideText(ctx,course,1720);lines.forEach((line,i)=>ctx.fillText(line,960,200+i*49));
      // A 630px QR gives an integer 14px scale for this 45-module asset, including quiet zone.
      ctx.imageSmoothingEnabled=false;ctx.drawImage(qr,645,278,630,630);ctx.imageSmoothingEnabled=true;
      ctx.font='700 25px Arial';ctx.fillText('QUÉT MÃ ĐỂ ĐIỂM DANH',960,940);
      ctx.font='20px Arial';ctx.fillText('Họ tên · Chức danh · Đơn vị công tác',960,972);
      ctx.fillStyle='#a56409';ctx.font='700 38px Arial';ctx.fillText('ĐIỂM DANH NGÀY '+day.label,960,1024);
      ctx.fillStyle='#123b62';ctx.font='18px Arial';ctx.fillText('Gia Lai, tháng 10 năm 2026',960,1056);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('Không tạo được ảnh');
      const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`Slide-diem-danh-Gia-Lai-${day.day}.png`;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(error){alert('Chưa tải được ảnh slide. Vui lòng thử lại.');}
    finally{button.disabled=false;button.textContent='Tải ảnh slide ↓';}
  }
  function present(day,course){
    if(!slide){slide=document.createElement('dialog');slide.className='attendance-slide';document.body.appendChild(slide);slide.addEventListener('cancel',leaveFullscreen);slide.addEventListener('close',leaveFullscreen);}
    slide.innerHTML=`<button class="attendance-slide-close" type="button" aria-label="Đóng slide điểm danh">Đóng ×</button><header><img src="assets/logo-kiem-toan-nha-nuoc.jpg" alt="Logo Kiểm toán nhà nước"><div><strong>KIỂM TOÁN NHÀ NƯỚC</strong><span>TRƯỜNG ĐÀO TẠO VÀ BỒI DƯỠNG<br>NGHIỆP VỤ KIỂM TOÁN</span></div></header><div class="attendance-slide-course"><small>KHÓA ĐÀO TẠO</small><h1>${esc(course)}</h1></div><div class="attendance-slide-qr"><img src="assets/qr/attendance-${day.day}.png" alt="QR điểm danh ngày ${esc(day.label)}"><strong>QUÉT MÃ ĐỂ ĐIỂM DANH</strong><span>Họ tên · Chức danh · Đơn vị công tác</span></div><footer>ĐIỂM DANH NGÀY <b>${esc(day.label)}</b><span>Gia Lai, tháng 10 năm 2026</span></footer>`;
    const closeButton=slide.querySelector('.attendance-slide-close'),actions=document.createElement('div');actions.className='attendance-slide-actions';closeButton.before(actions);actions.appendChild(closeButton);
    const downloadButton=document.createElement('button');downloadButton.type='button';downloadButton.className='attendance-slide-download';downloadButton.textContent='Tải ảnh slide ↓';downloadButton.onclick=()=>downloadSlide(day,course,downloadButton);actions.prepend(downloadButton);
    closeButton.onclick=close;slide.showModal();
    if(!document.fullscreenElement)document.documentElement.requestFullscreen?.().then(()=>{ownsFullscreen=true;if(!slide.open)leaveFullscreen();}).catch(()=>{});
  }
  function render(root,data,{loading=false}={}){
    const previousScroll=root.querySelector('.attendance-table-wrap')?.scrollTop||0;
    const oldInput=root.querySelector('.attendance-search'),searching=document.activeElement===oldInput,selection=oldInput?.selectionStart;
    root.dataset.kind='attendance';root.dataset.phase='attendance';
    if(!data){root.innerHTML=`<section class="panel"><h2>Điểm danh khóa đào tạo</h2><p>${loading?'Đang tải thống kê điểm danh…':'Chưa tải được dữ liệu. Bấm Cập nhật để thử lại.'}</p></section>`;return;}
    const day=data.days.find(d=>d.day===selected)||data.days[0],stats=selected==='all'?data.combined:day;
    root.innerHTML=`<section class="section-head"><div><p class="section-kicker">GIA LAI · ĐIỂM DANH</p><h2>Thống kê học viên tham dự</h2><p>${esc(data.course)}</p></div></section>${data.error?`<p class="attendance-warning">${esc(data.error)}</p>`:''}<section class="attendance-qr-grid">${data.days.map(d=>`<article class="panel attendance-qr-card"><button type="button" data-attendance-slide="${d.day}"><img src="assets/qr/attendance-${d.day}.png" alt="QR ${esc(d.label)}"><span><small>ĐIỂM DANH NGÀY</small><strong>${esc(d.label)}</strong><b>Bấm để chiếu slide toàn màn hình ↗</b></span></button><a href="${esc(d.url)}" target="_blank" rel="noopener">Mở Form ngày ${esc(d.label)} →</a></article>`).join('')}</section><div class="attendance-day-tabs" role="group" aria-label="Chọn ngày điểm danh">${data.days.map(d=>`<button type="button" class="${selected===d.day?'active':''}" data-attendance-day="${d.day}">Ngày ${esc(d.label)}</button>`).join('')}<button type="button" data-attendance-day="all" class="${selected==='all'?'active':''}">Cả hai ngày</button></div><section class="attendance-metrics"><article><span>Tổng người điểm danh</span><strong>${stats.totalPeople}</strong><small>${selected==='all'?'Gộp cùng họ tên + đơn vị giữa hai ngày':`Ngày ${esc(day.label)}`}</small></article><article><span>Đơn vị đã điểm danh</span><strong>${stats.participatingUnits}<small>/${stats.totalUnits}</small></strong><small>Toàn bộ xã, phường trong danh mục</small></article><article><span>Đơn vị chưa có người</span><strong>${stats.missingUnits.length}</strong><small>Cần đôn đốc điểm danh</small></article></section><section class="panel attendance-missing"><h3>Đơn vị chưa có người điểm danh (${stats.missingUnits.length})</h3><details><summary>${stats.missingUnits.length?'Mở danh sách đơn vị cần đôn đốc':'Tất cả đơn vị đã có người điểm danh'}</summary><ul>${stats.missingUnits.map(unit=>`<li>${esc(unit)}</li>`).join('')}</ul></details></section><section class="panel"><h3>Thống kê theo đơn vị</h3><input class="attendance-search" type="search" placeholder="Tìm xã, phường…" aria-label="Tìm đơn vị điểm danh"><div class="attendance-table-wrap"><table class="attendance-table"><thead><tr><th>Đơn vị</th><th>Số người</th><th>Trạng thái</th></tr></thead><tbody>${stats.units.slice().sort((a,b)=>b.count-a.count||a.unit.localeCompare(b.unit,'vi')).map(item=>`<tr data-attendance-unit="${esc(item.unit.toLocaleLowerCase('vi'))}"><td>${esc(item.unit)}</td><td><strong>${item.count}</strong></td><td>${item.count?'Đã có người điểm danh':'Chưa điểm danh'}</td></tr>`).join('')}</tbody></table></div></section><p class="attendance-note">Cập nhật: ${esc(new Date(data.updatedAt).toLocaleString('vi-VN'))}. Loại trùng theo họ tên + đơn vị; không phân biệt chữ hoa/thường và khoảng trắng. Người trùng cả họ tên lẫn đơn vị có thể bị gộp. ${stats.duplicateResponses} ${selected==='all'?'lượt trùng nhận diện khi gộp hai ngày':'lượt gửi lặp trong ngày'} đã gộp; ${stats.excludedResponses} dòng thiếu thông tin/ngoài danh mục chưa tính. Hai ngày được phân theo Form đã quét; không tự chuyển ngày theo thời gian gửi. Thống kê này độc lập với bài tập và Top 5.</p>`;
    root.querySelectorAll('[data-attendance-day]').forEach(b=>b.onclick=()=>{selected=b.dataset.attendanceDay;render(root,data);});
    root.querySelectorAll('[data-attendance-slide]').forEach(b=>b.onclick=()=>present(data.days.find(d=>d.day===b.dataset.attendanceSlide),data.course));
    const filter=()=>root.querySelectorAll('[data-attendance-unit]').forEach(row=>row.hidden=!row.dataset.attendanceUnit.includes(query.toLocaleLowerCase('vi').trim()));
    const input=root.querySelector('.attendance-search');input.value=query;input.oninput=e=>{query=e.target.value;filter();};filter();
    if(searching){input.focus({preventScroll:true});if(selection!=null)input.setSelectionRange(selection,selection);}
    const details=root.querySelector('.attendance-missing details');details.open=missingOpen;details.ontoggle=()=>{missingOpen=details.open;};
    root.querySelector('.attendance-table-wrap').scrollTop=previousScroll;
  }
  window.GiaLaiAttendance={render,close};
})();
