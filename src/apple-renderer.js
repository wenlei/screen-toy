(function () {
  var canvas = document.getElementById('canvas');
  var ctx = canvas.getContext('2d');
  var img = new Image();
  img.src = 'assets/apple.png';

  function draw(ts) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
})();
