(() => {
  'use strict';
  const url = 'https://docs.google.com/forms/d/e/1FAIpQLSfrfXU9Zv0V6FJupge22cwK7gQPa9bSbGkTqIz21A5tzzRk_w/viewform';
  const button = document.createElement('button');
  button.className = 'button button-survey';
  button.type = 'button';
  button.textContent = 'Khảo sát khóa học';
  document.querySelector('#fullscreen-button').before(button);
  let screen;
  button.onclick = () => {
    if (!screen) {
      screen = document.createElement('dialog');
      screen.className = 'survey-screen';
      screen.setAttribute('aria-label', 'Khảo sát khóa học Gia Lai');
      screen.innerHTML = `<header class="presentation-head"><div><span>GIA LAI · KHẢO SÁT HỌC VIÊN</span><h2>Quét mã QR để góp ý khóa học</h2></div><button class="presentation-close" data-close>Đóng ×</button></header><div class="survey-image"><img src="assets/anh-khao-sat-gia-lai-1000.png" alt="Mã QR mở form khảo sát khóa học Gia Lai"></div><div class="survey-actions"><a class="button button-survey" href="${url}" target="_blank" rel="noopener">Mở form khảo sát ↗</a><a class="button" href="assets/anh-khao-sat-gia-lai-1000.png" download="anh-khao-sat-gia-lai-1000.png">Tải ảnh 1000 × 1000</a><a class="button" href="assets/qr-khao-sat-gia-lai.png" download="qr-khao-sat-gia-lai.png">Tải QR riêng</a></div>`;
      document.body.appendChild(screen);
      screen.querySelector('[data-close]').onclick = () => screen.close();
    }
    screen.showModal();
  };
})();
