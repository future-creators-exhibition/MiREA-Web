import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// ==========================================
//  設定定数
// ==========================================
const CLOUD_MODEL_PATH = "assets/models/cloud.glb"; // お手持ちの雲GLBのパス
const CLOUD_BASE_SIZE = 0.75; // 塔に対して小さめ＆たくさん浮かぶサイズ

// URLに ?mode=monitor が付いている場合は展示用定点カメラモードで起動
const urlParams = new URLSearchParams(window.location.search);
let isMonitorMode = urlParams.get("mode") === "monitor";

// Three.js 基本オブジェクト
let scene, camera, renderer, controls;
let skyUniforms;
let towerGroup, leftDoor, rightDoor, doorLight;
let doorOpenProgress = 0;
let doorKeepOpenTimer = 0;

// 雲アバター＆グループ管理
let baseCloudTemplate = null;
let cloudAvatars = [];
let dreamClusters = []; // ワールド各地に点在する「雲の溜まり場（グループ拠点）」
let connectionLinesMesh = null;
const clock = new THREE.Clock();

const CHAT_SYMBOLS = ["♡", "♪", "✦", "✧", "☁"];

// ==========================================
//  初期化
// ==========================================
async function init() {
    const container = document.getElementById("canvas-container");

    // 1. シーンとフォグ
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xfff0f7, 0.008);

    // 2. カメラ
    camera = new THREE.PerspectiveCamera(
        55,
        window.innerWidth / window.innerHeight,
        0.1,
        500,
    );

    // 3. レンダラー
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    container.appendChild(renderer.domElement);

    // 4. カメラコントロール
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.minDistance = 6;
    controls.maxDistance = 95;
    controls.target.set(0, 5, 0);

    // 5. ライティング
    setupLights();

    // 6. 動くピンク＆紫の空
    createAnimatedDreamSky();

    // 7. OZ風グリッド地面
    createOzGridGround();

    // 8. 中央の塔と扉
    createDreamTower();

    // 9. 交流ライン用のダイナミックLineSegments
    createConnectionLinesObject();

    // 10. 雲のGLBモデル読み込み
    await loadCloudModel();

    // 11. 各地に点在するグループ拠点＆初期雲アバター生成
    initDreamClusters();
    spawnInitialClouds();

    // 12. カメラモード＆UIイベント
    applyCameraMode(isMonitorMode);
    setupUIEvents();

    window.addEventListener("resize", onWindowResize);
    renderer.setAnimationLoop(animate);
}

// ==========================================
//  ライティング
// ==========================================
function setupLights() {
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xffd6e8, 1.35);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfff5fa, 1.05);
    dirLight.position.set(25, 45, 30);
    scene.add(dirLight);

    const subLight = new THREE.DirectionalLight(0xe2d4ff, 0.65);
    subLight.position.set(-30, 20, -25);
    scene.add(subLight);
}

// ==========================================
//  動くピンク＆紫のグラデーション空
// ==========================================
function createAnimatedDreamSky() {
    skyUniforms = {
        uTime: { value: 0 },
        uColorTop: { value: new THREE.Color(0xe6d6ff) },
        uColorMid: { value: new THREE.Color(0xffd2e6) },
        uColorBottom: { value: new THREE.Color(0xfff7fb) },
    };

    const skyGeo = new THREE.SphereGeometry(260, 32, 32);
    const skyMat = new THREE.ShaderMaterial({
        uniforms: skyUniforms,
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
        fragmentShader: `
      uniform float uTime;
      uniform vec3 uColorTop;
      uniform vec3 uColorMid;
      uniform vec3 uColorBottom;
      varying vec3 vWorldPosition;

      void main() {
        vec3 dir = normalize(vWorldPosition);
        float h = clamp(dir.y * 0.85 + 0.15, 0.0, 1.0);

        float wave1 = sin(dir.x * 3.5 + uTime * 0.35) * cos(dir.z * 3.5 - uTime * 0.25);
        float wave2 = sin((dir.x + dir.z) * 5.0 - uTime * 0.4) * 0.5;
        float swirl = (wave1 + wave2) * 0.14;

        float mixFactor = clamp(h + swirl, 0.0, 1.0);
        vec3 col = mix(uColorBottom, uColorMid, smoothstep(0.0, 0.52, mixFactor));
        col = mix(col, uColorTop, smoothstep(0.45, 1.0, mixFactor));

        gl_FragColor = vec4(col, 1.0);
      }
    `,
    });

    scene.add(new THREE.Mesh(skyGeo, skyMat));
}

// ==========================================
//  OZ風グリッド地面
// ==========================================
function createOzGridGround() {
    const planeGeo = new THREE.CircleGeometry(250, 64);
    const planeMat = new THREE.MeshStandardMaterial({
        color: 0xfff8fc,
        roughness: 0.4,
        metalness: 0.05,
    });
    const plane = new THREE.Mesh(planeGeo, planeMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.02;
    scene.add(plane);

    const gridMain = new THREE.GridHelper(320, 80, 0xe89ec0, 0xf2c8dc);
    gridMain.material.transparent = true;
    gridMain.material.opacity = 0.55;
    scene.add(gridMain);

    const ringRadii = [10, 22, 40, 65];
    ringRadii.forEach((radius, idx) => {
        const ringGeo = new THREE.RingGeometry(
            radius - 0.12,
            radius + 0.12,
            96,
        );
        const ringMat = new THREE.MeshBasicMaterial({
            color: idx % 2 === 0 ? 0xe58eb5 : 0xc6aef0,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.45,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.01;
        scene.add(ring);
    });
}

// ==========================================
//  中央の塔と開閉する扉
// ==========================================
function createDreamTower() {
    towerGroup = new THREE.Group();
    scene.add(towerGroup);

    const whiteMarbleMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.25,
        metalness: 0.1,
    });

    const roseGoldMat = new THREE.MeshStandardMaterial({
        color: 0xf4a4c6,
        emissive: 0xf4a4c6,
        emissiveIntensity: 0.25,
        roughness: 0.2,
        metalness: 0.5,
    });

    const base1 = new THREE.Mesh(
        new THREE.CylinderGeometry(7.2, 8.2, 0.6, 32),
        whiteMarbleMat,
    );
    base1.position.y = 0.3;
    towerGroup.add(base1);

    const base2 = new THREE.Mesh(
        new THREE.CylinderGeometry(5.6, 6.2, 0.6, 32),
        roseGoldMat,
    );
    base2.position.y = 0.9;
    towerGroup.add(base2);

    const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(3.2, 4.6, 18, 24),
        whiteMarbleMat,
    );
    pillar.position.y = 10.2;
    towerGroup.add(pillar);

    for (let i = 0; i < 3; i++) {
        const torus = new THREE.Mesh(
            new THREE.TorusGeometry(4.2 - i * 0.5, 0.12, 16, 64),
            roseGoldMat,
        );
        torus.rotation.x = Math.PI / 2;
        torus.position.y = 15 + i * 2.2;
        towerGroup.add(torus);
    }

    const spire = new THREE.Mesh(
        new THREE.OctahedronGeometry(2.2, 0),
        new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xffb8d9,
            emissiveIntensity: 0.7,
            roughness: 0.1,
        }),
    );
    spire.position.y = 22.5;
    spire.name = "towerSpire";
    towerGroup.add(spire);

    const gateZ = 4.3;
    const gateFrame = new THREE.Mesh(
        new THREE.BoxGeometry(4.2, 5.4, 1.2),
        roseGoldMat,
    );
    gateFrame.position.set(0, 3.8, gateZ);
    towerGroup.add(gateFrame);

    const portalInner = new THREE.Mesh(
        new THREE.PlaneGeometry(3.2, 4.6),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    portalInner.position.set(0, 3.6, gateZ + 0.55);
    towerGroup.add(portalInner);

    doorLight = new THREE.PointLight(0xffb6d9, 0, 18);
    doorLight.position.set(0, 3.6, gateZ + 1.5);
    towerGroup.add(doorLight);

    const doorGeo = new THREE.BoxGeometry(1.62, 4.6, 0.25);
    const doorMat = new THREE.MeshStandardMaterial({
        color: 0xfff5fa,
        emissive: 0xffd2e6,
        emissiveIntensity: 0.2,
        roughness: 0.2,
    });

    leftDoor = new THREE.Mesh(doorGeo, doorMat);
    leftDoor.position.set(-0.81, 3.6, gateZ + 0.68);
    towerGroup.add(leftDoor);

    rightDoor = new THREE.Mesh(doorGeo, doorMat);
    rightDoor.position.set(0.81, 3.6, gateZ + 0.68);
    towerGroup.add(rightDoor);
}

// 雲同士が会話しているときに結ぶ光の糸
function createConnectionLinesObject() {
    const maxPairs = 120;
    const positions = new Float32Array(maxPairs * 2 * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setDrawRange(0, 0);

    const material = new THREE.LineBasicMaterial({
        color: 0xf08cb6,
        transparent: true,
        opacity: 0.45,
    });

    connectionLinesMesh = new THREE.LineSegments(geometry, material);
    scene.add(connectionLinesMesh);
}

// ==========================================
//  雲のGLBモデル読み込み（小さめサイズに正規化）
// ==========================================
function loadCloudModel() {
    return new Promise((resolve) => {
        const loader = new GLTFLoader();
        loader.load(
            CLOUD_MODEL_PATH,
            (gltf) => {
                baseCloudTemplate = gltf.scene;
                const box = new THREE.Box3().setFromObject(baseCloudTemplate);
                const size = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z) || 1;
                // 塔に対して小さめのサイズ（CLOUD_BASE_SIZE）に統一
                const scale = CLOUD_BASE_SIZE / maxDim;
                baseCloudTemplate.scale.setScalar(scale);

                resolve();
            },
            undefined,
            () => {
                baseCloudTemplate = createFallbackCloudMesh();
                resolve();
            },
        );
    });
}

function createFallbackCloudMesh() {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.85,
    });

    const puffs = [
        { x: 0, y: 0.08, z: 0, r: 0.32 },
        { x: -0.28, y: -0.02, z: 0.04, r: 0.24 },
        { x: 0.28, y: -0.02, z: -0.02, r: 0.24 },
        { x: -0.12, y: -0.04, z: 0.2, r: 0.2 },
        { x: 0.14, y: -0.03, z: -0.18, r: 0.2 },
    ];

    for (const p of puffs) {
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(p.r, 16, 16),
            mat.clone(),
        );
        mesh.position.set(p.x, p.y, p.z);
        group.add(mesh);
    }
    return group;
}

// ==========================================
//  不透明テクスチャでも綺麗に色づく雲インスタンス生成
// ==========================================
function createColoredCloudInstance(tintHexColor) {
    const wrapper = new THREE.Group();
    const cloudModel = baseCloudTemplate.clone();
    const tintColor = new THREE.Color(tintHexColor);

    // テクスチャ（map）を保持したまま、ベース色の乗算＋自己発光で内側から色づいた質感を出す
    cloudModel.traverse((child) => {
        if (child.isMesh && child.material) {
            const mat = child.material.clone();
            // 白と抽出色をブレンドしてテクスチャの上に淡い色を乗せる
            mat.color = new THREE.Color(0xffffff).lerp(tintColor, 0.42);
            if (mat.emissive) {
                mat.emissive = tintColor;
                mat.emissiveIntensity = 0.35;
            }
            child.material = mat;
        }
    });
    wrapper.add(cloudModel);

    // 雲の周囲をふんわり包む淡い光のオーラ（スプライト）
    const glowSprite = createSoftGlowSprite(tintColor);
    glowSprite.scale.set(1.6, 1.6, 1);
    wrapper.add(glowSprite);

    // 会話中に頭上に浮かぶフキダシアイコン（初期は非表示）
    const symbol =
        CHAT_SYMBOLS[Math.floor(Math.random() * CHAT_SYMBOLS.length)];
    const bubbleSprite = createChatBubbleSprite(symbol);
    bubbleSprite.position.set(0, 0.78, 0);
    bubbleSprite.scale.set(0.01, 0.01, 1);
    bubbleSprite.visible = false;
    wrapper.add(bubbleSprite);

    return { wrapper, bubbleSprite };
}

// 柔らかい光のオーラテクスチャ生成
function createSoftGlowSprite(threeColor) {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");

    const r = Math.round(threeColor.r * 255);
    const g = Math.round(threeColor.g * 255);
    const b = Math.round(threeColor.b * 255);

    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.55)`);
    grad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.2)`);
    grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
    });
    return new THREE.Sprite(mat);
}

// 会話フキダシスプライト生成
function createChatBubbleSprite(symbol) {
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext("2d");

    // 白い丸フキダシ
    ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
    ctx.beginPath();
    ctx.arc(48, 44, 30, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(235, 130, 175, 0.85)";
    ctx.lineWidth = 4;
    ctx.stroke();

    // 小さなしっぽ
    ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
    ctx.beginPath();
    ctx.moveTo(42, 72);
    ctx.lineTo(48, 82);
    ctx.lineTo(54, 72);
    ctx.fill();

    // アイコン文字
    ctx.fillStyle = "#d96b98";
    ctx.font = "bold 34px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(symbol, 48, 45);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
    });
    return new THREE.Sprite(mat);
}

// ==========================================
//  各地に点在する「雲のグループ拠点（クラスター）」初期化
// ==========================================
function initDreamClusters() {
    dreamClusters = [];
    const clusterCount = 6; // ワールド各地に6つのグループ拠点を作る

    for (let i = 0; i < clusterCount; i++) {
        const angle = (i / clusterCount) * Math.PI * 2 + Math.random() * 0.4;
        const dist = 12 + Math.random() * 20;
        dreamClusters.push({
            x: Math.cos(angle) * dist,
            z: Math.sin(angle) * dist,
            y: 3.0 + Math.random() * 6.0,
            orbitAngle: angle,
            orbitRadius: dist,
            orbitSpeed:
                (Math.random() > 0.5 ? 1 : -1) * (0.04 + Math.random() * 0.04),
        });
    }
}

// 初期の雲アバターたち（各グループに3〜6個ずつ固まって点在）
function spawnInitialClouds() {
    const sampleColors = [
        0xff8ec2, 0x8cc8ff, 0xc9a6ff, 0xffbe94, 0x94e5c4, 0xffa6d6,
    ];
    const initialCount = 34;

    for (let i = 0; i < initialCount; i++) {
        const col = sampleColors[i % sampleColors.length];
        const clusterIdx = i % dreamClusters.length;
        const cluster = dreamClusters[clusterIdx];

        // グループ拠点の周りに固まって配置
        const localAngle = Math.random() * Math.PI * 2;
        const localDist = 1.2 + Math.random() * 4.2;
        const posX = cluster.x + Math.cos(localAngle) * localDist;
        const posZ = cluster.z + Math.sin(localAngle) * localDist;
        const posY = cluster.y + (Math.random() - 0.5) * 2.2;

        const { wrapper, bubbleSprite } = createColoredCloudInstance(col);
        wrapper.position.set(posX, posY, posZ);
        scene.add(wrapper);

        cloudAvatars.push({
            mesh: wrapper,
            bubbleSprite,
            state: "FLOATING",
            emergeProgress: 1,
            clusterIndex: clusterIdx,
            vx: (Math.random() - 0.5) * 0.02,
            vy: 0,
            vz: (Math.random() - 0.5) * 0.02,
            wanderAngle: Math.random() * Math.PI * 2,
            bobOffset: Math.random() * Math.PI * 2,
            baseY: posY,
            chatTimer: 0,
            chatPartner: null,
        });
    }
}

// 塔の扉が開いて新しい雲が出現する演出
export function spawnCloudFromTowerDoor(tintHexColor = 0xff8ec2) {
    doorKeepOpenTimer = 2.8;

    const { wrapper, bubbleSprite } = createColoredCloudInstance(tintHexColor);
    wrapper.position.set(0, 3.0, 3.4);
    wrapper.scale.setScalar(0.25);
    scene.add(wrapper);

    // 扉を出たあと、正面近くのグループ拠点へ合流させる
    const targetClusterIdx = Math.floor(Math.random() * dreamClusters.length);
    const spreadAngle = (Math.random() - 0.5) * Math.PI * 0.75;
    const targetDist = 10 + Math.random() * 12;
    const targetHeight = 3.2 + Math.random() * 4.5;

    const targetPos = new THREE.Vector3(
        Math.sin(spreadAngle) * targetDist,
        targetHeight,
        Math.cos(spreadAngle) * targetDist,
    );

    cloudAvatars.push({
        mesh: wrapper,
        bubbleSprite,
        state: "EMERGING",
        emergeProgress: 0,
        startScale: 0.25,
        targetScale: 1.0,
        targetPos,
        clusterIndex: targetClusterIdx,
        vx: 0,
        vy: 0,
        vz: 0,
        wanderAngle: spreadAngle,
        bobOffset: Math.random() * Math.PI * 2,
        baseY: targetHeight,
        chatTimer: 0,
        chatPartner: null,
    });
}

// ==========================================
//  毎フレーム更新（グループ移動・会話モーション・扉開閉）
// ==========================================
function animate() {
    const delta = clock.getDelta();
    const elapsed = clock.getElapsedTime();

    if (skyUniforms) {
        skyUniforms.uTime.value = elapsed;
    }

    const spire = towerGroup.getObjectByName("towerSpire");
    if (spire) {
        spire.rotation.y = elapsed * 0.8;
        spire.position.y = 22.5 + Math.sin(elapsed * 2) * 0.25;
    }

    // 塔の扉の開閉
    if (doorKeepOpenTimer > 0) {
        doorKeepOpenTimer -= delta;
        doorOpenProgress = THREE.MathUtils.lerp(doorOpenProgress, 1, 0.08);
    } else {
        doorOpenProgress = THREE.MathUtils.lerp(doorOpenProgress, 0, 0.05);
    }

    if (leftDoor && rightDoor) {
        leftDoor.position.x = -0.81 - doorOpenProgress * 1.35;
        rightDoor.position.x = 0.81 + doorOpenProgress * 1.35;
        doorLight.intensity = doorOpenProgress * 4.5;
    }

    // グループ拠点自体もゆっくり移動させる（溜まり場の場所が時間とともに変化）
    for (const c of dreamClusters) {
        c.orbitAngle += c.orbitSpeed * delta;
        c.x = Math.cos(c.orbitAngle) * c.orbitRadius;
        c.z = Math.sin(c.orbitAngle) * c.orbitRadius;
    }

    // 雲アバターたちの移動＆会話アニメーション
    updateCloudAvatars(delta, elapsed);

    if (isMonitorMode) {
        camera.position.set(
            Math.sin(elapsed * 0.22) * 1.6,
            8.2 + Math.cos(elapsed * 0.28) * 0.35,
            23.5,
        );
        camera.lookAt(0, 5.0, 2);
    } else {
        controls.update();
    }

    renderer.render(scene, camera);
}

function updateCloudAvatars(delta, elapsed) {
    const linePositions =
        connectionLinesMesh.geometry.attributes.position.array;
    let lineVertexCount = 0;

    for (let i = 0; i < cloudAvatars.length; i++) {
        const a = cloudAvatars[i];

        // 1. 扉からの出現アニメーション
        if (a.state === "EMERGING") {
            a.emergeProgress += delta * 0.6;
            const t = Math.min(a.emergeProgress, 1);
            const ease = 1 - Math.pow(1 - t, 3);

            const startPos = new THREE.Vector3(0, 3.0, 3.6);
            a.mesh.position.lerpVectors(startPos, a.targetPos, ease);
            a.mesh.position.y += Math.sin(t * Math.PI) * 1.4;

            const s = THREE.MathUtils.lerp(a.startScale, a.targetScale, ease);
            a.mesh.scale.setScalar(s);

            if (t >= 1) {
                a.state = "FLOATING";
                a.baseY = a.mesh.position.y;
            }
            continue;
        }

        // 2. たまに別のグループへお散歩しに行く（グループ間の行き来）
        if (Math.random() < 0.0012) {
            a.clusterIndex = Math.floor(Math.random() * dreamClusters.length);
        }

        const myCluster = dreamClusters[a.clusterIndex];

        // 会話中の挙動（立ち止まって相手の方を向き、ピョコピョコ跳ねてフキダシを出す）
        if (a.chatTimer > 0 && a.chatPartner) {
            a.chatTimer -= delta;

            // 相手の方へ向きを合わせる
            const dx = a.chatPartner.mesh.position.x - a.mesh.position.x;
            const dz = a.chatPartner.mesh.position.z - a.mesh.position.z;
            const targetAngle = Math.atan2(dx, dz);
            a.mesh.rotation.y = THREE.MathUtils.lerp(
                a.mesh.rotation.y,
                targetAngle,
                0.1,
            );

            // 会話中の楽しそうな上下バウンド（相槌モーション）
            const nodBounce =
                Math.abs(Math.sin(elapsed * 7 + a.bobOffset)) * 0.22;
            a.mesh.position.y = a.baseY + nodBounce;

            // フキダシ表示＆拡大
            a.bubbleSprite.visible = true;
            const bScale = THREE.MathUtils.lerp(
                a.bubbleSprite.scale.x,
                0.65,
                0.15,
            );
            a.bubbleSprite.scale.set(bScale, bScale, 1);

            // 会話中の2体を光の糸で結ぶ
            if (lineVertexCount < 230) {
                linePositions[lineVertexCount * 3] = a.mesh.position.x;
                linePositions[lineVertexCount * 3 + 1] = a.mesh.position.y;
                linePositions[lineVertexCount * 3 + 2] = a.mesh.position.z;
                lineVertexCount++;

                linePositions[lineVertexCount * 3] =
                    a.chatPartner.mesh.position.x;
                linePositions[lineVertexCount * 3 + 1] =
                    a.chatPartner.mesh.position.y;
                linePositions[lineVertexCount * 3 + 2] =
                    a.chatPartner.mesh.position.z;
                lineVertexCount++;
            }

            if (a.chatTimer <= 0) {
                a.chatPartner = null;
                a.bubbleSprite.visible = false;
                a.bubbleSprite.scale.set(0.01, 0.01, 1);
            }
            continue;
        }

        // 3. 通常時の移動（所属グループへの凝集引力 ＋ ランダムウォーク ＋ 反発）
        a.wanderAngle += (Math.random() - 0.5) * 0.09;
        a.vx += Math.cos(a.wanderAngle) * 0.0014;
        a.vz += Math.sin(a.wanderAngle) * 0.0014;

        // 所属グループの中心へゆるやかに引き寄せられる（これで各地に溜まり場ができる）
        const dxCluster = myCluster.x - a.mesh.position.x;
        const dzCluster = myCluster.z - a.mesh.position.z;
        const distCluster = Math.hypot(dxCluster, dzCluster) || 1;
        if (distCluster > 2.5) {
            a.vx += (dxCluster / distCluster) * 0.0024;
            a.vz += (dzCluster / distCluster) * 0.0024;
        }

        // 高さもグループの高さにゆるやかに合わせる
        a.baseY = THREE.MathUtils.lerp(a.baseY, myCluster.y, 0.01);

        // 塔にめり込まないよう押し出す
        const distTower = Math.hypot(a.mesh.position.x, a.mesh.position.z) || 1;
        if (distTower < 8.5) {
            a.vx += (a.mesh.position.x / distTower) * 0.006;
            a.vz += (a.mesh.position.z / distTower) * 0.006;
        }

        // 他の雲との反発＆会話イベント発生判定
        for (let j = i + 1; j < cloudAvatars.length; j++) {
            const b = cloudAvatars[j];
            if (b.state !== "FLOATING") continue;

            const dx = b.mesh.position.x - a.mesh.position.x;
            const dy = b.mesh.position.y - a.mesh.position.y;
            const dz = b.mesh.position.z - a.mesh.position.z;
            const d = Math.hypot(dx, dy, dz) || 1;

            // 近すぎたら反発（雲が小さくなったので距離もコンパクトに調整）
            if (d < 1.8) {
                const push = (1.8 - d) * 0.0018;
                a.vx -= (dx / d) * push;
                a.vz -= (dz / d) * push;
                b.vx += (dx / d) * push;
                b.vz += (dz / d) * push;
            }

            // 近くにいる2体がランダムに会話（交流）を開始する
            if (
                d < 2.8 &&
                a.chatTimer <= 0 &&
                b.chatTimer <= 0 &&
                Math.random() < 0.008
            ) {
                const chatDuration = 3.0 + Math.random() * 2.5;
                a.chatTimer = chatDuration;
                b.chatTimer = chatDuration;
                a.chatPartner = b;
                b.chatPartner = a;
            }
        }

        a.vx *= 0.94;
        a.vz *= 0.94;
        a.mesh.position.x += a.vx;
        a.mesh.position.z += a.vz;
        a.mesh.position.y =
            a.baseY + Math.sin(elapsed * 1.8 + a.bobOffset) * 0.18;

        // 進行方向へゆるやかに向きを変える
        if (Math.hypot(a.vx, a.vz) > 0.0015) {
            const targetRotY = Math.atan2(a.vx, a.vz);
            a.mesh.rotation.y = THREE.MathUtils.lerp(
                a.mesh.rotation.y,
                targetRotY,
                0.04,
            );
        }
    }

    connectionLinesMesh.geometry.setDrawRange(0, lineVertexCount);
    connectionLinesMesh.geometry.attributes.position.needsUpdate = true;
}

// ==========================================
//  カメラモード切替＆UIイベント
// ==========================================
function applyCameraMode(monitor) {
    isMonitorMode = monitor;
    const appEl = document.getElementById("world-app");
    const labelEl = document.getElementById("camera-mode-label");

    if (isMonitorMode) {
        appEl.classList.add("is-monitor-mode");
        controls.enabled = false;
        labelEl.textContent = "MONITOR MODE（塔の定点カメラ）";
    } else {
        appEl.classList.remove("is-monitor-mode");
        controls.enabled = true;
        camera.position.set(14, 12, 28);
        controls.target.set(0, 5, 0);
        labelEl.textContent = "EXPLORE MODE（指でドラッグ・ピンチ操作）";
    }
}

function setupUIEvents() {
    document.getElementById("btn-spawn-pink").addEventListener("click", () => {
        spawnCloudFromTowerDoor(0xff8ec2);
    });

    document.getElementById("btn-spawn-blue").addEventListener("click", () => {
        spawnCloudFromTowerDoor(0x88c8ff);
    });

    document
        .getElementById("btn-toggle-camera")
        .addEventListener("click", () => {
            applyCameraMode(!isMonitorMode);
        });

    const drawer = document.getElementById("pocket-drawer");
    document.getElementById("btn-menu").addEventListener("click", () => {
        drawer.classList.add("is-open");
    });
    document
        .getElementById("btn-close-drawer")
        .addEventListener("click", () => {
            drawer.classList.remove("is-open");
        });
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

init();
