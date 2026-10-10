(() => {
  'use strict';
  // Three fixed invitation rounds supplied by the organizer (37 units each).
  const units = `Phường An Bình|Phường An Nhơn Bắc|Phường An Nhơn Đông|Phường An Nhơn Nam|Phường An Phú|Phường Ayun Pa|Phường Bình Định|Phường Bồng Sơn|Phường Diên Hồng|Phường Hoài Nhơn|Phường Hoài Nhơn Bắc|Phường Hoài Nhơn Đông|Phường Hoài Nhơn Nam|Phường Hoài Nhơn Tây|Phường Hội Phú|Phường Pleiku|Phường Quy Nhơn|Phường Quy Nhơn Bắc|Phường Quy Nhơn Đông|Phường Quy Nhơn Nam|Phường Tam Quan|Phường Thống Nhất|Xã Al Bá|Xã An Lão|Xã An Lương|Xã Ayun|Xã Ân Hảo|Xã Ân Tường|Xã Bàu Cạn|Xã Bình An|Xã Bình Dương|Xã Bình Hiệp|Xã Bình Khê|Xã Bình Phú|Xã Bờ Ngoong|Xã Canh Liên|Xã Canh Vinh|Xã Cát tiến|Xã Chơ Long|Xã Chư A Thai|Xã Chư Krey|Xã Chư Prông|Xã Chư Sê|Xã Cửu An|Xã Đak Đoa|Xã Đak Pơ|Xã Đak Rong|Xã Đak Sơmei|Xã Đăk Song|Xã Đức Cơ|Xã Gào|Xã Hòa Hội|Xã Hoài Ân|Xã Hội Sơn|Xã Hra|Xã Ia Băng|Xã Ia Boòng|Xã Ia Chia|Xã Ia Dom|Xã Ia Dơk|Xã Ia Dreh|Xã Ia Grai|Xã Ia Hrú|Xã Ia Hrung|Xã Ia Krái|Xã Ia Mơ|Xã Ia Nan|Xã Ia O|Xã Ia Pa|Xã Ia Pia|Xã Ia Pnôn|Xã Ia Púch|Xã Ia Rsai|Xã Ia Tôr|Xã Ia Tul|Xã Kbang|Xã KDang|Xã Kim Sơn|Xã Kon Chiêng|Xã Kon Gang|Xã Kông Bơ La|Xã Krong|Xã Lơ Pang|Xã Mang Yang|Xã Ngô Mây|Xã Nhơn Châu|Xã Phù Cát|Xã Phù Mỹ|Xã Phù Mỹ Bắc|Xã Phù Mỹ Đông|Xã Phù Mỹ Nam|Xã Phù Mỹ Tây|Xã Phú Thiện|Xã Phú Túc|Xã Sơn Lang|Xã SRó|Xã Tây Sơn|Xã Tơ Tung|Xã Tuy Phước|Xã Tuy Phước Bắc|Xã Tuy Phước Đông|Xã Tuy Phước Tây|Xã Uar|Xã Vạn Đức|Xã Vân Canh|Xã Vĩnh Quang|Xã Vĩnh Sơn|Xã Vĩnh Thạnh|Xã Xuân An|Xã Ya Hội|Xã Ya Ma`.split('|');
  let screen, round = 0, previousOverflow = '';
  const draw = () => {
    const start = round * 37;
    screen.innerHTML = `<header class="certificate-head"><img src="assets/logo-kiem-toan-nha-nuoc.jpg" alt="Kiểm toán nhà nước"><div><p>KIỂM TOÁN NHÀ NƯỚC · TẬP HUẤN GIA LAI</p><h2>Trao giấy chứng nhận</h2><span>Kính mời đại diện các đơn vị lên nhận giấy chứng nhận</span></div><div class="certificate-round"><small>ĐỢT</small><b>${round + 1}</b><span>37 đơn vị</span></div></header><ol class="certificate-list" start="${start + 1}" aria-label="Danh sách 37 đơn vị đợt ${round + 1}">${units.slice(start, start + 37).map((name, i) => `<li><span class="certificate-number">${start + i + 1}</span><span>${name}</span></li>`).join('')}</ol><footer class="certificate-controls"><button data-prev ${round === 0 ? 'disabled' : ''} aria-label="Đợt trước">← Đợt trước</button><div class="certificate-tabs" aria-label="Chọn đợt">${[0, 1, 2].map(i => `<button data-round="${i}" aria-pressed="${round === i}">Đợt ${i + 1}<small>${i * 37 + 1}–${(i + 1) * 37}</small></button>`).join('')}</div><button data-next ${round === 2 ? 'disabled' : ''} aria-label="Đợt tiếp theo">Đợt tiếp →</button><button data-close aria-label="Đóng trình chiếu">Đóng ×</button></footer>`;
    screen.querySelector('[data-prev]').onclick = () => change(round - 1);
    screen.querySelector('[data-next]').onclick = () => change(round + 1);
    screen.querySelectorAll('[data-round]').forEach(button => button.onclick = () => change(Number(button.dataset.round)));
    screen.querySelector('[data-close]').onclick = () => screen.close();
  };
  const change = value => { if (value >= 0 && value < 3) { round = value; draw(); screen.querySelector(`[data-round="${round}"]`).focus(); } };
  function open(value = 0) {
    if (!screen) {
      screen = document.createElement('dialog');
      screen.className = 'certificate-screen';
      screen.setAttribute('aria-label', 'Trình chiếu danh sách nhận giấy chứng nhận');
      document.body.appendChild(screen);
      screen.addEventListener('keydown', event => {
        if (['ArrowRight', 'PageDown', 'ArrowLeft', 'PageUp', '1', '2', '3'].includes(event.key)) {
          event.preventDefault();
          change(/^[123]$/.test(event.key) ? Number(event.key) - 1 : round + (['ArrowRight', 'PageDown'].includes(event.key) ? 1 : -1));
        }
      });
      screen.addEventListener('close', () => {
        document.body.style.overflow = previousOverflow;
        if (document.fullscreenElement === screen) document.exitFullscreen().catch(() => {});
      });
    }
    round = value; draw();
    if (!screen.open) { previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; screen.showModal(); }
    if (screen.requestFullscreen && !document.fullscreenElement) screen.requestFullscreen().catch(() => {});
  }
  function mount(root) {
    const section = document.createElement('section');
    section.className = 'panel certificate-launch';
    section.innerHTML = '<div><p class="panel-kicker">TRAO GIẤY CHỨNG NHẬN</p><h3>Danh sách đơn vị nhận GCN</h3><p>111 đơn vị · 3 đợt · 37 đơn vị mỗi đợt</p></div><div class="certificate-launch-actions"><button class="presentation-trigger" data-certificates>Chiếu danh sách nhận GCN ↗</button><div><button data-start="0">Đợt 1</button><button data-start="1">Đợt 2</button><button data-start="2">Đợt 3</button></div></div>';
    root.querySelector('.course-intro')?.after(section);
    section.querySelector('[data-certificates]').onclick = () => open();
    section.querySelectorAll('[data-start]').forEach(button => button.onclick = () => open(Number(button.dataset.start)));
  }
  window.GiaLaiCertificates = { mount, open, units };
})();
