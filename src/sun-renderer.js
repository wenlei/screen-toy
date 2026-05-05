(function () {
  var canvas = document.getElementById('canvas');
  var ctx = canvas.getContext('2d');
  var SIZE = 160;
  var CX = SIZE / 2, CY = SIZE / 2;
  var R = 22;

  var currentCloseness = 0;
  var currentAngle = 0;

  if (window.screenToy) {
    window.screenToy.onSunData(function (data) {
      currentCloseness = data.closeness || 0;
      currentAngle     = data.angle     || 0;
    });
  }

  function draw() {
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.save();
    ctx.translate(CX, CY);

    var c = currentCloseness;
    var ang = currentAngle;
    // Scale the whole sun up as it closes in (1.0× far → 1.7× touching)
    var sunScale = 1.0 + c * 0.7;
    ctx.scale(sunScale, sunScale);

    var bodyR = R * (1 + c * 0.12);

    // Red glow when close
    if (c > 0.3) {
      var glow = ctx.createRadialGradient(0, 0, bodyR * 0.5, 0, 0, bodyR * 2.8);
      glow.addColorStop(0, 'rgba(255,80,0,' + (c * 0.45) + ')');
      glow.addColorStop(1, 'rgba(255,80,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, bodyR * 2.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Spinning rays — sharper, more jagged when close
    ctx.save();
    ctx.rotate(ang);
    var rayLen = R * 0.6 + c * R * 0.5;
    var numRays = 8;
    ctx.strokeStyle = c > 0.5 ? '#ff5500' : '#e8a000';
    ctx.lineWidth = 2.5 + c * 1.5;
    for (var i = 0; i < numRays; i++) {
      var a = (i / numRays) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (bodyR + 2), Math.sin(a) * (bodyR + 2));
      ctx.lineTo(Math.cos(a) * (bodyR + 2 + rayLen), Math.sin(a) * (bodyR + 2 + rayLen));
      ctx.stroke();
    }
    ctx.restore();

    // Body — blends orange when very close
    var bodyColor = c < 0.5
      ? '#ffd020'
      : 'rgb(' + Math.round(255) + ',' + Math.round(208 - c * 120) + ',' + Math.round(32 - c * 32) + ')';
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.arc(0, 0, bodyR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = c > 0.5 ? '#cc2200' : '#d08800';
    ctx.lineWidth = 1.5 + c;
    ctx.stroke();

    // ── Face ───────────────────────────────────────────────────────────────
    var eyeY = -bodyR * 0.12;
    var eyeX =  bodyR * 0.30;
    var eyeR =  bodyR * 0.145;

    // Eyes: always half-lid (pressed down top), furious slant
    ctx.fillStyle = '#3a1800';
    for (var side = -1; side <= 1; side += 2) {
      ctx.save();
      ctx.translate(side * eyeX, eyeY);
      // Clip upper half with a tilted line so the top lid looks pressed down
      ctx.beginPath();
      ctx.arc(0, 0, eyeR, 0, Math.PI * 2);
      ctx.fill();
      // White over-paint the top portion to simulate heavy lid
      var lidDrop = eyeR * (0.45 + c * 0.3); // lid drops further when close
      ctx.fillStyle = bodyColor;
      ctx.fillRect(-eyeR - 1, -eyeR - 1, eyeR * 2 + 2, eyeR + 1 - lidDrop);
      ctx.fillStyle = '#3a1800';
      ctx.restore();
    }

    // Eyebrows: always steep V, get more extreme when close
    var browAngle = 0.45 + c * 0.55;  // steeper inward angle when close
    var browThick = 2.0 + c * 1.5;
    var browY = eyeY - eyeR - 1 - c * 3;
    ctx.strokeStyle = '#3a1800';
    ctx.lineWidth = browThick;
    ctx.lineCap = 'round';
    // Left brow: rises left→right (inner end lower = angry)
    ctx.beginPath();
    ctx.moveTo(-eyeX - eyeR * 1.1, browY - eyeR * browAngle * 0.5);
    ctx.lineTo(-eyeX + eyeR * 0.9, browY + eyeR * browAngle);
    ctx.stroke();
    // Right brow: mirrors
    ctx.beginPath();
    ctx.moveTo( eyeX - eyeR * 0.9, browY + eyeR * browAngle);
    ctx.lineTo( eyeX + eyeR * 1.1, browY - eyeR * browAngle * 0.5);
    ctx.stroke();

    // Mouth: frown always; bares teeth when close
    var mouthY = bodyR * 0.32;
    var mouthW = bodyR * 0.30;
    if (c < 0.35) {
      // Slight frown arc
      ctx.strokeStyle = '#3a1800';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, mouthY + bodyR * 0.12, mouthW * 0.9, Math.PI + 0.25, -0.25);
      ctx.stroke();
    } else {
      // Open snarl with visible teeth
      var openH = bodyR * 0.17 * c;
      ctx.fillStyle = '#7a1500';
      ctx.beginPath();
      ctx.ellipse(0, mouthY, mouthW, openH, 0, 0, Math.PI * 2);
      ctx.fill();
      // Teeth (3 upper)
      ctx.fillStyle = '#fffbe8';
      var tw = mouthW * 0.55;
      var th = openH * 0.55;
      ctx.beginPath();
      ctx.rect(-tw, mouthY - openH * 0.1, tw * 2 / 3, -th);
      ctx.rect(-tw / 6, mouthY - openH * 0.1, tw * 2 / 3, -th);
      ctx.rect(tw - tw * 2 / 3, mouthY - openH * 0.1, tw * 2 / 3, -th);
      ctx.fill();
    }

    ctx.restore();
  }

  function loop() {
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
