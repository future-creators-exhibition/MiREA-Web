// ==========================================
//  MiREA - Dream World Visual & Serial Controller
// ==========================================

const TOTAL_IMAGES = 45;
const IMAGE_DIR = "assets/collage/";
const IMAGE_PREFIX = "collage";
const IMAGE_EXT = ".jpg";
const BASE_SHARE_URL = "https://mirea-dream-map.example.com/view?id=";

let collageImages = [];
let unusedIndices = [];
let currentImage = null;
let currentImageIndex = 1;

// ステート管理: 'STANDBY' | 'SCANNING' | 'REVEAL' | 'ICON_READY'
let systemState = "STANDBY";
let stateStartTime = 0;
const SCAN_DURATION = 7500; // スキャン演出（7.5秒）
const REVEAL_DURATION = 2500; // 画像全体を見せる時間（2.5秒）

// アニメーション補間用変数
let currentW = 0;
let currentH = 0;
let targetW = 0;
let targetH = 0;
let currentRadius = 12;
let targetRadius = 12;
let currentPosY = 0;
let targetPosY = 0;
let imageAlpha = 0;

// QRコード描画用変数
let currentQrImage = null;
let qrAlpha = 0;
let qrSlideY = 20;

// 背景の淡い雲＆光の粒子
let dreamClouds = [];
let particles = [];

// スキャン演出用データログ配列
let hexLogs = [];
const LOG_LABELS = [
    "REM_DREAM_WAVE",
    "PASTEL_MEMORY_0x8F",
    "SUBCONSCIOUS_CLOUD",
    "VISUAL_ECHO_MAP",
    "FRAGMENT_ALIGN_OK",
    "SOFT_MEMORY_EXTRACT",
    "DREAM_SEED_LOCKED",
];

// 手形のワイヤーフレーム座標
const HAND_CONTOUR = [
    { x: -0.22, y: 0.65 },
    { x: -0.28, y: 0.25 },
    { x: -0.58, y: 0.05 },
    { x: -0.72, y: -0.18 },
    { x: -0.45, y: -0.22 },
    { x: -0.35, y: -0.15 },
    { x: -0.4, y: -0.72 },
    { x: -0.22, y: -0.72 },
    { x: -0.18, y: -0.22 },
    { x: -0.14, y: -0.85 },
    { x: 0.04, y: -0.85 },
    { x: 0.04, y: -0.22 },
    { x: 0.14, y: -0.76 },
    { x: 0.3, y: -0.72 },
    { x: 0.22, y: -0.18 },
    { x: 0.38, y: -0.55 },
    { x: 0.5, y: -0.48 },
    { x: 0.32, y: 0.25 },
    { x: 0.22, y: 0.65 },
];

// 手のひら内部の生体スキャンポイント
const HAND_NODES = [
    { x: 0.0, y: 0.35 },
    { x: -0.15, y: 0.1 },
    { x: 0.12, y: 0.08 },
    { x: 0.0, y: -0.05 },
    { x: -0.3, y: -0.45 },
    { x: -0.05, y: -0.52 },
    { x: 0.18, y: -0.46 },
    { x: 0.35, y: -0.32 },
    { x: -0.55, y: -0.08 },
];

// Web Serial API 関連
let port = null;
let writer = null;
let reader = null;
let serialBuffer = "";

function preload() {
    for (let i = 1; i <= TOTAL_IMAGES; i++) {
        let path = `${IMAGE_DIR}${IMAGE_PREFIX}${i}${IMAGE_EXT}`;
        collageImages[i] = loadImage(
            path,
            () => {},
            () => {
                console.warn(`画像が見つかりません: ${path}`);
            },
        );
    }
}

function setup() {
    let canvas = createCanvas(windowWidth, windowHeight);
    canvas.parent("canvas-container");
    imageMode(CENTER);
    rectMode(CENTER);
    angleMode(DEGREES);

    resetUnusedPool();
    initDreamAtmosphere();
    resetToStandby(false);
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}

function resetUnusedPool() {
    unusedIndices = [];
    for (let i = 1; i <= TOTAL_IMAGES; i++) {
        unusedIndices.push(i);
    }
    for (let i = unusedIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [unusedIndices[i], unusedIndices[j]] = [
            unusedIndices[j],
            unusedIndices[i],
        ];
    }
}

function pickNextImage() {
    if (unusedIndices.length === 0) {
        resetUnusedPool();
    }
    currentImageIndex = unusedIndices.pop();
    currentImage = collageImages[currentImageIndex];

    const targetUrl = `${BASE_SHARE_URL}${currentImageIndex}`;
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=10&color=5c4d66&bgcolor=ffffff&data=${encodeURIComponent(targetUrl)}`;
    currentQrImage = loadImage(
        qrApiUrl,
        () => {},
        (err) => {
            console.error("QR画像ロードエラー:", err);
        },
    );
}

// 淡いピンク・ラベンダーの雲と光の粒子の初期化
function initDreamAtmosphere() {
    dreamClouds = [];
    const cloudColors = [
        [255, 198, 222], // 淡いベビーピンク
        [255, 218, 235], // ミルキーピンク
        [232, 214, 255], // 淡いラベンダー
        [214, 238, 255], // 淡いベビーブルー
        [255, 232, 218], // 淡いピーチクリーム
    ];

    for (let i = 0; i < 14; i++) {
        let col = random(cloudColors);
        dreamClouds.push({
            x: random(-100, width + 100),
            y: random(-100, height + 100),
            size: random(380, 760),
            vx: random(-0.25, 0.25),
            vy: random(-0.15, 0.15),
            r: col[0],
            g: col[1],
            b: col[2],
            alpha: random(55, 95),
        });
    }

    particles = [];
    for (let i = 0; i < 55; i++) {
        particles.push({
            x: random(width),
            y: random(height),
            r: random(3, 8),
            vx: random(-0.25, 0.25),
            vy: random(-0.45, -0.1),
            alpha: random(90, 180),
            isPink: random() > 0.4,
        });
    }
}

function draw() {
    // 白ベースの柔らかい背景
    background(255, 250, 253);

    // 淡いピンク・パステルの雲レイヤー
    drawDreamClouds();

    // 浮かぶ光の玉（ボケ感）
    drawAmbientParticles();

    if (systemState === "STANDBY") {
        drawStandbyVisual();
    } else if (systemState === "SCANNING") {
        drawScanningVisual();
    } else if (systemState === "REVEAL" || systemState === "ICON_READY") {
        drawDreamRevealAndClip();
    }

    if (systemState === "ICON_READY") {
        drawQrCardOnCanvas();
    }
}

// ふわふわと漂う淡いピンクの雲（放射グラデーション）
function drawDreamClouds() {
    push();
    for (let c of dreamClouds) {
        c.x += c.vx;
        c.y += c.vy;

        if (c.x < -c.size / 2) c.x = width + c.size / 2;
        if (c.x > width + c.size / 2) c.x = -c.size / 2;
        if (c.y < -c.size / 2) c.y = height + c.size / 2;
        if (c.y > height + c.size / 2) c.y = -c.size / 2;

        let ctx = drawingContext;
        let grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.size / 2);
        grad.addColorStop(0, `rgba(${c.r}, ${c.g}, ${c.b}, ${c.alpha / 255})`);
        grad.addColorStop(
            0.55,
            `rgba(${c.r}, ${c.g}, ${c.b}, ${(c.alpha * 0.45) / 255})`,
        );
        grad.addColorStop(1, `rgba(${c.r}, ${c.g}, ${c.b}, 0)`);

        ctx.fillStyle = grad;
        noStroke();
        circle(c.x, c.y, c.size);
    }
    pop();
}

// 白と淡いピンクの光の粒子
function drawAmbientParticles() {
    noStroke();
    for (let p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < -10) p.y = height + 10;
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;

        if (p.isPink) {
            fill(244, 158, 196, p.alpha);
        } else {
            fill(255, 255, 255, p.alpha + 40);
        }
        circle(p.x, p.y, p.r);
    }
}

// 待機画面の淡いピンクの波紋アニメーション
function drawStandbyVisual() {
    push();
    translate(width / 2, height / 2 - 30);
    noFill();

    let pulse = sin(frameCount * 2) * 16;

    // 内側の白い光の輪
    stroke(255, 255, 255, 210);
    strokeWeight(3);
    circle(0, 0, 210 + pulse);

    // 外側の淡いローズピンクの輪
    stroke(235, 130, 175, 115);
    strokeWeight(1.5);
    circle(0, 0, 240 + pulse);

    stroke(200, 175, 235, 80);
    strokeWeight(1);
    circle(0, 0, 310 - pulse * 0.7);
    pop();
}

// ==========================================
//  夢のスキャン演出（左：記憶波形 / 中央：HUD / 右：手形レーザー）
// ==========================================
function drawScanningVisual() {
    let elapsed = millis() - stateStartTime;
    let progress = constrain(elapsed / SCAN_DURATION, 0, 1);

    drawScanGrid();
    drawLeftDataPanel(progress);
    drawRightHandScanner(progress);
    drawCenterHudRing(progress);

    if (elapsed >= SCAN_DURATION) {
        transitionToReveal();
    }
}

function drawScanGrid() {
    push();
    stroke(230, 165, 195, 38);
    strokeWeight(1);
    const step = 64;
    for (let x = 0; x < width; x += step) {
        line(x, 0, x, height);
    }
    for (let y = 0; y < height; y += step) {
        line(0, y, width, y);
    }
    pop();
}

// 左側パネル：夢の波形データ・解析バー・HEXメモリダンプ（すりガラス風）
function drawLeftDataPanel(progress) {
    const panelW = min(width * 0.28, 360);
    const panelH = min(height * 0.56, 460);
    const centerX = width * 0.21;
    const centerY = height * 0.46;
    const leftX = centerX - panelW / 2;
    const topY = centerY - panelH / 2;

    push();
    // 半透明ホワイトのパネル背景
    rectMode(CENTER);
    fill(255, 255, 255, 185);
    stroke(235, 155, 190, 130);
    strokeWeight(1.5);
    rect(centerX, centerY, panelW, panelH, 12);

    drawCornerBrackets(centerX, centerY, panelW, panelH, 12);

    // ヘッダーラベル
    fill(217, 107, 152, 235);
    noStroke();
    textAlign(LEFT, TOP);
    textSize(12);
    text("DREAM STREAM // MEMORY ANALYSIS", leftX + 16, topY + 14);

    // 1. 夢の周波数波形
    const waveTop = topY + 46;
    const waveH = 85;
    const waveW = panelW - 32;
    fill(255, 245, 250, 170);
    stroke(235, 165, 195, 90);
    rectMode(CORNER);
    rect(leftX + 16, waveTop, waveW, waveH, 6);

    // メイン波形（ローズピンク）
    noFill();
    stroke(228, 110, 162, 220);
    strokeWeight(2);
    beginShape();
    for (let x = 0; x <= waveW; x += 4) {
        let freq1 = sin(x * 3 + frameCount * 8) * 18;
        let freq2 = cos(x * 7 - frameCount * 12) * 10;
        let noiseVal = (noise(x * 0.05, frameCount * 0.08) - 0.5) * 24;
        let y = waveTop + waveH / 2 + (freq1 + freq2 + noiseVal) * 0.75;
        vertex(leftX + 16 + x, y);
    }
    endShape();

    // サブ波形（ラベンダーブルー）
    stroke(165, 155, 235, 170);
    strokeWeight(1.5);
    beginShape();
    for (let x = 0; x <= waveW; x += 6) {
        let y = waveTop + waveH / 2 + sin(x * 2 - frameCount * 5) * 20;
        vertex(leftX + 16 + x, y);
    }
    endShape();

    // 2. 3つのサブ解析プログレスバー
    const barsTop = waveTop + waveH + 22;
    const metrics = [
        { label: "DREAM SYNC", val: constrain(progress * 1.25, 0, 1) },
        {
            label: "MEMORY FRAGMENT",
            val: constrain((progress - 0.15) * 1.2, 0, 1),
        },
        {
            label: "ICON CRYSTALLIZE",
            val: constrain((progress - 0.3) * 1.4, 0, 1),
        },
    ];

    for (let i = 0; i < metrics.length; i++) {
        let y = barsTop + i * 38;
        fill(105, 88, 115, 220);
        noStroke();
        textSize(10);
        textAlign(LEFT, TOP);
        text(metrics[i].label, leftX + 16, y);

        textAlign(RIGHT, TOP);
        fill(217, 107, 152);
        text(`${floor(metrics[i].val * 100)}%`, leftX + panelW - 16, y);

        // バー背景
        fill(235, 215, 228, 150);
        rect(leftX + 16, y + 16, waveW, 6, 3);

        // バー進行
        fill(238, 130, 178, 225);
        rect(leftX + 16, y + 16, waveW * metrics[i].val, 6, 3);
    }

    // 3. 高速HEXメモリログ表示
    const logTop = barsTop + 124;
    const logH = panelH - (logTop - topY) - 16;
    if (frameCount % 5 === 0) {
        let hexCode = floor(random(0x100000, 0xffffff))
            .toString(16)
            .toUpperCase();
        let tag = random(LOG_LABELS);
        hexLogs.push(`[0x${hexCode}] ${tag}`);
        if (hexLogs.length > 7) hexLogs.shift();
    }

    fill(255, 246, 251, 190);
    stroke(235, 165, 195, 80);
    rect(leftX + 16, logTop, waveW, logH, 6);

    noStroke();
    textAlign(LEFT, TOP);
    textSize(10);
    for (let i = 0; i < hexLogs.length; i++) {
        let alpha = map(i, 0, hexLogs.length, 100, 240);
        fill(130, 105, 145, alpha);
        text(hexLogs[i], leftX + 24, logTop + 10 + i * 18);
    }

    pop();
}

// 右側パネル：手形ホログラム＆上下レーザースキャン
function drawRightHandScanner(progress) {
    const panelW = min(width * 0.28, 360);
    const panelH = min(height * 0.56, 460);
    const centerX = width * 0.79;
    const centerY = height * 0.46;
    const leftX = centerX - panelW / 2;
    const topY = centerY - panelH / 2;

    push();
    rectMode(CENTER);
    fill(255, 255, 255, 185);
    stroke(235, 155, 190, 130);
    strokeWeight(1.5);
    rect(centerX, centerY, panelW, panelH, 12);

    drawCornerBrackets(centerX, centerY, panelW, panelH, 12);

    fill(217, 107, 152, 235);
    noStroke();
    textAlign(LEFT, TOP);
    textSize(12);
    text("PALM IMPRINT // LIGHT SCAN", leftX + 16, topY + 14);

    const handScale = min(panelW, panelH) * 0.44;
    const handCenterY = centerY + 15;

    let scanNormY = sin(frameCount * 3.2);
    let laserY = handCenterY + scanNormY * (handScale * 0.95);

    push();
    translate(centerX, handCenterY);

    noFill();
    stroke(235, 165, 195, 70);
    circle(0, 0, handScale * 1.6);
    circle(0, 0, handScale * 1.1);

    // 1. 手形ワイヤーフレームの塗り（淡いピンクのホログラム）
    fill(255, 200, 224, 75);
    stroke(228, 115, 165, 190);
    strokeWeight(1.8);
    beginShape();
    for (let pt of HAND_CONTOUR) {
        vertex(pt.x * handScale, pt.y * handScale);
    }
    endShape(CLOSE);

    // 2. 内部の神経ネットワーク線
    stroke(185, 160, 230, 110);
    strokeWeight(1);
    for (let i = 0; i < HAND_NODES.length; i++) {
        for (let j = i + 1; j < HAND_NODES.length; j++) {
            let d = dist(
                HAND_NODES[i].x,
                HAND_NODES[i].y,
                HAND_NODES[j].x,
                HAND_NODES[j].y,
            );
            if (d < 0.55) {
                line(
                    HAND_NODES[i].x * handScale,
                    HAND_NODES[i].y * handScale,
                    HAND_NODES[j].x * handScale,
                    HAND_NODES[j].y * handScale,
                );
            }
        }
    }

    // 3. 生体ポイント
    for (let node of HAND_NODES) {
        let nx = node.x * handScale;
        let ny = node.y * handScale;
        let localLaserY = scanNormY * (handScale * 0.95);
        let distToLaser = abs(ny - localLaserY);

        if (distToLaser < 28) {
            fill(255, 130, 180, 240);
            noStroke();
            circle(nx, ny, 9);
            noFill();
            stroke(255, 150, 195, 180);
            circle(nx, ny, 20);
        } else {
            fill(195, 155, 230, 180);
            noStroke();
            circle(nx, ny, 5);
        }
    }
    pop();

    // 4. 上下往復レーザービーム（淡いピンク＆ホワイトの光線）
    const beamW = panelW - 28;
    noStroke();
    for (let offset = -18; offset <= 18; offset += 3) {
        let alpha = map(abs(offset), 0, 18, 110, 0);
        fill(255, 145, 195, alpha);
        rectMode(CENTER);
        rect(centerX, laserY + offset, beamW, 3);
    }

    stroke(255, 255, 255, 250);
    strokeWeight(2.5);
    line(centerX - beamW / 2, laserY, centerX + beamW / 2, laserY);

    fill(228, 110, 162);
    noStroke();
    triangle(
        centerX - beamW / 2,
        laserY,
        centerX - beamW / 2 - 8,
        laserY - 5,
        centerX - beamW / 2 - 8,
        laserY + 5,
    );
    triangle(
        centerX + beamW / 2,
        laserY,
        centerX + beamW / 2 + 8,
        laserY - 5,
        centerX + beamW / 2 + 8,
        laserY + 5,
    );

    fill(130, 105, 145, 200);
    textAlign(CENTER, BOTTOM);
    textSize(11);
    text(
        `SCAN DEPTH: ${floor(map(scanNormY, -1, 1, 0, 100))}% // ACTIVE`,
        centerX,
        topY + panelH - 14,
    );

    pop();
}

// 中央の統合HUDリング
function drawCenterHudRing(progress) {
    push();
    translate(width / 2, height * 0.46);

    // 中央の柔らかい白円ベース
    fill(255, 255, 255, 175);
    noStroke();
    circle(0, 0, 180);

    noFill();
    push();
    rotate(frameCount * 0.8);
    stroke(235, 155, 190, 110);
    strokeWeight(1.2);
    for (let a = 0; a < 360; a += 10) {
        let r1 = 115;
        let r2 = a % 30 === 0 ? 126 : 120;
        line(cos(a) * r1, sin(a) * r1, cos(a) * r2, sin(a) * r2);
    }
    pop();

    push();
    rotate(-frameCount * 1.5);
    stroke(195, 170, 235, 140);
    strokeWeight(1.5);
    arc(0, 0, 195, 195, 0, 110);
    arc(0, 0, 195, 195, 180, 290);
    pop();

    // プログレスアーク
    stroke(240, 215, 228, 160);
    strokeWeight(5);
    circle(0, 0, 165);

    stroke(235, 120, 170, 235);
    strokeWeight(5);
    arc(0, 0, 165, 165, -90, -90 + progress * 360);

    // 左右パネルへ繋がるデータリンク線
    stroke(235, 160, 195, 110);
    strokeWeight(1.2);
    line(-135, 0, -width * 0.15, 0);
    line(135, 0, width * 0.15, 0);

    // 中央パーセンテージ表示
    fill(92, 77, 102);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(26);
    text(`${floor(progress * 100)}%`, 0, -4);

    fill(217, 107, 152);
    textSize(10);
    text("EXTRACTING", 0, 18);

    pop();
}

function drawCornerBrackets(cx, cy, w, h, len) {
    let l = cx - w / 2;
    let r = cx + w / 2;
    let t = cy - h / 2;
    let b = cy + h / 2;

    stroke(235, 130, 175, 210);
    strokeWeight(2);
    noFill();

    line(l, t + len, l, t);
    line(l, t, l + len, t);
    line(r - len, t, r, t);
    line(r, t, r, t + len);
    line(l, b - len, l, b);
    line(l, b, l + len, b);
    line(r - len, b, r, b);
    line(r, b, r, b - len);
}

// ==========================================
//  画像全体表示 ➔ 角丸クリップ＆アイコンサイズへ収束
// ==========================================
function drawDreamRevealAndClip() {
    let elapsed = millis() - stateStartTime;

    if (systemState === "REVEAL" && elapsed >= REVEAL_DURATION) {
        transitionToIconReady();
    }

    imageAlpha = lerp(imageAlpha, 255, 0.08);
    currentW = lerp(currentW, targetW, 0.07);
    currentH = lerp(currentH, targetH, 0.07);
    currentRadius = lerp(currentRadius, targetRadius, 0.07);
    currentPosY = lerp(currentPosY, targetPosY, 0.07);

    if (currentImage && currentImage.width > 0) {
        push();
        translate(width / 2, currentPosY);

        // アイコン背後の柔らかい光のハロー（後光）
        if (systemState === "ICON_READY") {
            noStroke();
            fill(255, 255, 255, 210);
            circle(0, 0, currentW + 46);
            fill(255, 205, 228, 95);
            circle(0, 0, currentW + 76);
        }

        drawingContext.save();
        drawingContext.beginPath();
        drawingContext.roundRect(
            -currentW / 2,
            -currentH / 2,
            currentW,
            currentH,
            currentRadius,
        );
        drawingContext.clip();

        let imgAspect = currentImage.width / currentImage.height;
        let boxAspect = currentW / currentH;
        let drawW, drawH;

        if (imgAspect > boxAspect) {
            drawH = currentH;
            drawW = currentH * imgAspect;
        } else {
            drawW = currentW;
            drawH = currentW / imgAspect;
        }

        tint(255, imageAlpha);
        image(currentImage, 0, 0, drawW, drawH);
        drawingContext.restore();

        // クリップ枠に沿った上品なホワイト＆ピンクゴールド枠線
        noFill();
        stroke(255, 255, 255, imageAlpha * 0.9);
        strokeWeight(4);
        rect(0, 0, currentW, currentH, currentRadius);

        stroke(235, 145, 185, imageAlpha * 0.65);
        strokeWeight(1.5);
        rect(0, 0, currentW + 4, currentH + 4, currentRadius + 2);

        if (systemState === "ICON_READY") {
            let glowPulse = sin(frameCount * 3) * 6;
            stroke(235, 145, 185, 120);
            strokeWeight(1.5);
            circle(0, 0, currentW + 24 + glowPulse);

            stroke(195, 175, 235, 95);
            strokeWeight(1);
            circle(0, 0, currentW + 42 - glowPulse);

            noTint();
            fill(217, 107, 152, imageAlpha);
            noStroke();
            textAlign(CENTER, CENTER);
            textSize(14);
            text(
                `DREAM ICON #${nf(currentImageIndex, 2)}`,
                0,
                currentH / 2 + 38,
            );
        }

        pop();
    }
}

// 右下にQRコードカードをキャンバス直接描画（白＆パステルデザイン）
function drawQrCardOnCanvas() {
    let elapsedAfterClip = millis() - stateStartTime;
    if (elapsedAfterClip < 500) return;

    qrAlpha = lerp(qrAlpha, 255, 0.08);
    qrSlideY = lerp(qrSlideY, 0, 0.08);

    const cardW = 340;
    const cardH = 144;
    const marginRight = 48;
    const marginBottom = 48;

    const cardCenterX = width - marginRight - cardW / 2;
    const cardCenterY = height - marginBottom - cardH / 2 + qrSlideY;

    push();
    rectMode(CENTER);

    // カードの柔らかい影
    fill(215, 165, 190, qrAlpha * 0.22);
    noStroke();
    rect(cardCenterX, cardCenterY + 6, cardW, cardH, 16);

    // カード本体（ホワイトベース）
    fill(255, 255, 255, qrAlpha * 0.94);
    stroke(238, 165, 198, qrAlpha * 0.65);
    strokeWeight(1.5);
    rect(cardCenterX, cardCenterY, cardW, cardH, 16);

    // QRコード背景枠（ごく淡いピンク枠）
    const qrSize = 112;
    const qrCenterX = cardCenterX - cardW / 2 + 16 + qrSize / 2;
    const qrCenterY = cardCenterY;

    fill(255, 248, 252, qrAlpha);
    stroke(240, 195, 215, qrAlpha * 0.8);
    strokeWeight(1);
    rect(qrCenterX, qrCenterY, qrSize, qrSize, 8);

    if (currentQrImage && currentQrImage.width > 0) {
        tint(255, qrAlpha);
        image(currentQrImage, qrCenterX, qrCenterY, qrSize - 10, qrSize - 10);
        noTint();
    } else {
        fill(235, 145, 185, qrAlpha);
        noStroke();
        rect(qrCenterX, qrCenterY, qrSize - 24, qrSize - 24, 4);
        fill(255, qrAlpha);
        textAlign(CENTER, CENTER);
        textSize(10);
        text(`ID: #${nf(currentImageIndex, 2)}`, qrCenterX, qrCenterY);
    }

    // テキスト説明部分
    const textStartX = qrCenterX + qrSize / 2 + 18;
    textAlign(LEFT, CENTER);
    noStroke();

    fill(217, 107, 152, qrAlpha);
    textSize(15);
    text("DREAM ARCHIVE", textStartX, cardCenterY - 26);

    fill(110, 92, 120, qrAlpha * 0.9);
    textSize(12);
    text(
        "スマートフォンで読み取り、\nドリームマップへ持ち帰る",
        textStartX,
        cardCenterY + 12,
    );

    pop();
}

// スキャン開始
function startScan() {
    if (systemState !== "STANDBY") return;

    systemState = "SCANNING";
    stateStartTime = millis();
    hexLogs = [];
    pickNextImage();

    const standbyEl = document.getElementById("standby-guide");
    const scanningEl = document.getElementById("scanning-guide");
    if (standbyEl) standbyEl.classList.remove("is-active");
    if (scanningEl) scanningEl.classList.add("is-active");
}

// フェーズ1：画像全体表示
function transitionToReveal() {
    systemState = "REVEAL";
    stateStartTime = millis();
    imageAlpha = 0;

    let maxW = width * 0.68;
    let maxH = height * 0.72;
    let ratio = 1;
    if (currentImage && currentImage.width > 0) {
        ratio = min(maxW / currentImage.width, maxH / currentImage.height);
        targetW = currentImage.width * ratio;
        targetH = currentImage.height * ratio;
    } else {
        targetW = 400;
        targetH = 400;
    }

    currentW = targetW * 0.92;
    currentH = targetH * 0.92;
    currentRadius = 12;
    targetRadius = 12;
    currentPosY = height / 2 - 15;
    targetPosY = height / 2 - 15;

    const scanningEl = document.getElementById("scanning-guide");
    if (scanningEl) scanningEl.classList.remove("is-active");
}

// フェーズ2：正円アイコンへクリップ収束 ➔ 右下にQRコード生成
function transitionToIconReady() {
    systemState = "ICON_READY";
    stateStartTime = millis();
    const iconSize = 220;

    targetW = iconSize;
    targetH = iconSize;
    targetRadius = iconSize / 2;
    targetPosY = height / 2 - 15;

    qrAlpha = 0;
    qrSlideY = 20;
}

// リセット処理
async function resetToStandby(sendSerial = true) {
    systemState = "STANDBY";
    currentImage = null;
    currentQrImage = null;
    qrAlpha = 0;

    const standbyEl = document.getElementById("standby-guide");
    const scanningEl = document.getElementById("scanning-guide");
    if (standbyEl) standbyEl.classList.add("is-active");
    if (scanningEl) scanningEl.classList.remove("is-active");

    if (sendSerial && writer) {
        try {
            const encoder = new TextEncoder();
            await writer.write(encoder.encode("RESET\n"));
        } catch (err) {
            console.error("RESET送信エラー:", err);
        }
    }
}

function keyPressed() {
    if (key === "c" || key === "C") {
        connectSerial();
    } else if (key === "r" || key === "R") {
        resetToStandby(true);
    } else if (key === "s" || key === "S") {
        startScan();
    }
}

// ==========================================
//  Web Serial API 通信処理
// ==========================================
async function connectSerial() {
    if (!("serial" in navigator)) {
        alert("Google Chromeを使用してください。");
        return;
    }

    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 });

        writer = port.writable.getWriter();
        const indicator = document.getElementById("serial-indicator");
        if (indicator) {
            indicator.textContent = "Serial: Connected";
            indicator.style.color = "#d96b98";
        }

        console.log("M5Stackとシリアル接続しました");
        readSerialLoop();
    } catch (err) {
        console.error("シリアル接続エラー:", err);
    }
}

async function readSerialLoop() {
    const decoder = new TextDecoder();
    while (port && port.readable) {
        reader = port.readable.getReader();
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                if (value) {
                    serialBuffer += decoder.decode(value, { stream: true });
                    let lines = serialBuffer.split(/\r?\n/);
                    serialBuffer = lines.pop();

                    for (let line of lines) {
                        let msg = line.trim();
                        if (msg.length > 0) {
                            console.log("M5Stackから受信:", msg);
                        }
                        if (msg.includes("SCAN_START")) {
                            startScan();
                        }
                    }
                }
            }
        } catch (err) {
            console.error("シリアル読み取りエラー:", err);
        } finally {
            reader.releaseLock();
        }
    }
}
