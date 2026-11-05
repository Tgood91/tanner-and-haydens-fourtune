// tools/render-lumber-yard.page.js — runs inside Chromium for render-lumber-yard.js.
// window.renderYard(scene, view) builds the yard in three.js and draws one frame.
// Local metres, y up, north = -z, origin at the yard's middle.
/* global THREE */
(function () {
    const W = 1600, H = 900;
    let renderer = null;

    const col = (rgb, k = 1) => new THREE.Color(rgb[0] * k, rgb[1] * k, rgb[2] * k);
    const lambert = (hex, extra = {}) => new THREE.MeshLambertMaterial({ color: hex, ...extra });

    // A canvas texture: vertical stripes (corrugated metal) or windows
    function stripes(base, line, n) {
        const c = document.createElement("canvas"); c.width = 256; c.height = 64;
        const g = c.getContext("2d"); g.fillStyle = base; g.fillRect(0, 0, 256, 64);
        g.fillStyle = line;
        for (let i = 0; i < n; i++) g.fillRect(i * 256 / n, 0, 256 / n / 3, 64);
        const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
    }
    function windows(base, glass, cols, rows) {
        const c = document.createElement("canvas"); c.width = 256; c.height = 128;
        const g = c.getContext("2d"); g.fillStyle = base; g.fillRect(0, 0, 256, 128);
        g.fillStyle = glass;
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) g.fillRect(14 + i * 240 / cols, 18 + j * 110 / rows, 240 / cols - 22, 110 / rows - 30);
        return new THREE.CanvasTexture(c);
    }

    function meshFrom(tri, colour, receive = true, cast = false) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(tri, 3));
        geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: colour, side: THREE.DoubleSide }));
        m.receiveShadow = receive; m.castShadow = cast;
        return m;
    }

    // A flat strip along a polyline (roads, centre lines), lifted `lift` m
    function strip(pts, width, colour, lift = 0, dash = 0) {
        const pos = [];
        for (let i = 0; i < pts.length - 1; i++) {
            if (dash && i % dash >= dash / 2) continue;
            const a = pts[i], b = pts[i + 1];
            const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz) || 1;
            const nx = -dz / L * width / 2, nz = dx / L * width / 2;
            const A1 = [a[0] + nx, a[1] + lift, a[2] + nz], A2 = [a[0] - nx, a[1] + lift, a[2] - nz];
            const B1 = [b[0] + nx, b[1] + lift, b[2] + nz], B2 = [b[0] - nx, b[1] + lift, b[2] - nz];
            pos.push(...A1, ...B1, ...A2, ...A2, ...B1, ...B2);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: colour, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
        m.receiveShadow = true;
        return m;
    }

    function addBox(group, w, h, d, mat, x, y, z, rotY = 0) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, y + h / 2, z); m.rotation.y = rotY;
        m.castShadow = m.receiveShadow = true;
        group.add(m);
        return m;
    }

    // A gable roof: a triangular prism along x
    function gable(w, d, rise, mat) {
        const s = new THREE.Shape();
        s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, rise); s.lineTo(-d / 2, 0);
        const geo = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
        geo.translate(0, 0, -w / 2);
        geo.rotateY(Math.PI / 2);
        const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true;
        return m;
    }

    function buildYard(scene, Y) {
        const g = new THREE.Group();
        const f = Y.fence;

        // the yard's dirt
        const dirt = new THREE.Mesh(new THREE.PlaneGeometry(f.w, f.d), lambert(0x9c8a63, { polygonOffset: true, polygonOffsetFactor: -1 }));
        dirt.rotation.x = -Math.PI / 2; dirt.position.set(f.x, f.y + 0.25, f.z); dirt.receiveShadow = true;
        g.add(dirt);
        // fence: posts and two rails, gaps where the roads come in
        const post = lambert(0x6b5a3e), rail = lambert(0x8a7556);
        const gaps = [[f.x + 0, f.z - f.d / 2], [f.x - f.w / 2, f.z + f.d * 0.45]];
        const edge = (x0, z0, x1, z1) => {
            const L = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(L / 6);
            for (let i = 0; i <= n; i++) {
                const x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * i / n;
                if (gaps.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < 14)) continue;
                addBox(g, 0.3, 2.2, 0.3, post, x, f.y, z);
                if (i < n) {
                    const nx = x0 + (x1 - x0) * (i + 1) / n, nz = z0 + (z1 - z0) * (i + 1) / n;
                    if (gaps.some(([gx, gz]) => Math.hypot(gx - nx, gz - nz) < 14)) continue;
                    for (const h of [0.8, 1.8]) {
                        const r = addBox(g, Math.hypot(nx - x, nz - z), 0.12, 0.12, rail, (x + nx) / 2, f.y + h, (z + nz) / 2);
                        r.rotation.y = -Math.atan2(nz - z, nx - x);
                    }
                }
            }
        };
        const L = f.x - f.w / 2, R = f.x + f.w / 2, T = f.z - f.d / 2, B = f.z + f.d / 2;
        edge(L, T, R, T); edge(R, T, R, B); edge(R, B, L, B); edge(L, B, L, T);

        // the mill shed: corrugated walls, a gable roof, the big east door and a conveyor
        const s = Y.shed, wall = 12;
        const corr = stripes("#9aa1a8", "#868d94", 40); corr.repeat.set(4, 1);
        const shed = addBox(g, s.w, wall, s.d, new THREE.MeshLambertMaterial({ map: corr }), s.x, s.y, s.z);
        const roof = gable(s.w + 2, s.d + 3, 7, lambert(0x6c737a)); roof.position.set(s.x, s.y + wall, s.z); g.add(roof);
        addBox(g, 0.4, 9, s.d * 0.45, lambert(0x2b2f33), s.x + s.w / 2 + 0.1, s.y, s.z);              // the door
        addBox(g, 0.5, 2.5, 8, lambert(0xd6a13a), s.x + s.w / 2 + 0.3, s.y + 9.5, s.z);               // a sign band over it
        const conveyor = addBox(g, 34, 1.2, 3.2, lambert(0x3d4247), s.x + s.w / 2 + 16, s.y + 3, s.z + 4);
        conveyor.rotation.z = -0.16;
        for (const k of [0, 1, 2]) addBox(g, 0.6, 3 - k, 0.6, lambert(0x2b2f33), s.x + s.w / 2 + 6 + k * 11, s.y, s.z + 4);
        for (let i = 0; i < 4; i++) addBox(g, 3, 4, 3, lambert(0x7f878f), s.x - s.w / 2 + 10 + i * 24, s.y + wall + 5.5, s.z);   // roof vents
        void shed;

        // the office: two floors, windows, a pitched roof
        const o = Y.office;
        const win = windows("#a8674c", "#cfe6f5", 5, 2);
        addBox(g, o.w, 7.5, o.d, new THREE.MeshLambertMaterial({ map: win }), o.x, o.y, o.z);
        const oroof = gable(o.w + 1.5, o.d + 1.5, 4, lambert(0x4a4f55)); oroof.position.set(o.x, o.y + 7.5, o.z); g.add(oroof);
        addBox(g, 6, 0.4, 3, lambert(0x6b5a3e), o.x, o.y + 3.2, o.z + o.d / 2 + 1.4);   // porch roof

        // log piles: instanced logs in a stepped stack, cut ends showing
        const logGeo = new THREE.CylinderGeometry(0.42, 0.42, 1, 10); logGeo.rotateZ(Math.PI / 2);
        const bark = new THREE.MeshLambertMaterial({ color: 0x6e4a2c });
        const ends = new THREE.MeshLambertMaterial({ color: 0xd9b382 });
        const logMats = [bark, ends, ends];
        let count = 0;
        const placed = [];
        for (const p of Y.piles) {
            const rows = Math.floor(p.d / 0.9), segs = Math.max(1, Math.floor(p.w / 12));
            for (let layer = 0; layer < 7; layer++) {
                for (let r = layer; r < rows - layer; r++) for (let sgi = 0; sgi < segs; sgi++) {
                    placed.push([p.x - p.w / 2 + 6 + sgi * 12 + (layer % 2) * 0.3, p.y + 0.45 + layer * 0.75, p.z - p.d / 2 + 0.45 + r * 0.9, 11.4]);
                }
            }
        }
        const logs = new THREE.InstancedMesh(logGeo, logMats, placed.length);
        const m4 = new THREE.Matrix4();
        for (const [x, y, z, len] of placed) {
            m4.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(len, 1, 1));
            logs.setMatrixAt(count++, m4);
        }
        logs.castShadow = logs.receiveShadow = true;
        g.add(logs);

        // plank stacks: layered bundles with spacers
        const wood = [lambert(0xe3c58f), lambert(0xd8b678)], spacer = lambert(0x8a6a3a);
        for (const p of Y.planks) {
            for (let k = 0; k < 9; k++) {
                addBox(g, p.w * 0.9, 0.32, p.d * 0.9, wood[k % 2], p.x, p.y + k * 0.42, p.z);
                if (k < 8) for (const sx of [-0.35, 0, 0.35]) addBox(g, 0.25, 0.1, p.d * 0.9, spacer, p.x + sx * p.w, p.y + k * 0.42 + 0.32, p.z);
            }
        }

        // the sawdust pile
        const d = Y.dust;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(d.r, 7, 24), lambert(0xc9a66b));
        cone.position.set(d.x, d.y + 3.5, d.z); cone.castShadow = cone.receiveShadow = true; g.add(cone);

        // a logging truck loaded with logs, and a log loader, by the piles
        const p0 = Y.piles[0];
        const tx = p0.x - p0.w / 2 - 8, tz = p0.z + 10;
        const truck = new THREE.Group();
        addBox(truck, 3, 3.4, 2.8, lambert(0x2e6da4), 0, 0.9, 0);                 // cab
        addBox(truck, 0.2, 1.4, 2.4, lambert(0xcfe6f5), 1.55, 2.6, 0);            // windscreen
        addBox(truck, 11, 0.6, 2.6, lambert(0x34383c), -7, 1.1, 0);               // flatbed
        for (const sx of [-11, -3]) addBox(truck, 0.3, 3, 2.6, lambert(0x34383c), sx, 1.7, 0);   // stakes
        const tl = new THREE.InstancedMesh(logGeo, logMats, 9);
        let ti = 0;
        for (let row = 0; row < 3; row++) for (let k = 0; k < 3 - (row === 2 ? 1 : 0); k++) {
            m4.compose(new THREE.Vector3(-7, 2.2 + row * 0.8, -0.9 + k * 0.9 + (row === 2 ? 0.45 : 0)), new THREE.Quaternion(), new THREE.Vector3(10, 1, 1));
            tl.setMatrixAt(ti++, m4);
        }
        tl.count = ti; tl.castShadow = true; truck.add(tl);
        for (const [wx, wz] of [[0.3, 1.4], [0.3, -1.4], [-9, 1.4], [-9, -1.4], [-11, 1.4], [-11, -1.4]]) {
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.4, 14), lambert(0x1b1b1b));
            wheel.rotation.x = Math.PI / 2; wheel.position.set(wx, 0.55, wz); wheel.castShadow = true; truck.add(wheel);
        }
        truck.position.set(tx, p0.y, tz); truck.rotation.y = Math.PI / 2; g.add(truck);

        const loader = new THREE.Group();
        addBox(loader, 4.5, 2, 3, lambert(0xe0a526), 0, 0.8, 0);
        addBox(loader, 2, 2, 2.4, lambert(0xe0a526), -0.8, 2.8, 0);
        addBox(loader, 0.2, 1.2, 2, lambert(0xcfe6f5), 0.25, 3.2, 0);
        const arm = addBox(loader, 7, 0.6, 0.6, lambert(0x4a4f55), 4, 3.4, 0); arm.rotation.z = 0.5;
        addBox(loader, 1.4, 1.2, 2.2, lambert(0x4a4f55), 7.2, 4.4, 0);
        for (const [wx, wz] of [[1.5, 1.6], [1.5, -1.6], [-1.5, 1.6], [-1.5, -1.6]]) {
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.6, 14), lambert(0x1b1b1b));
            wheel.rotation.x = Math.PI / 2; wheel.position.set(wx, 0.8, wz); wheel.castShadow = true; loader.add(wheel);
        }
        loader.position.set(p0.x, p0.y, p0.z + p0.d / 2 + 8); loader.rotation.y = -0.6; g.add(loader);

        scene.add(g);
    }

    function buildTrees(scene, trees) {
        const crownGeo = new THREE.ConeGeometry(2.6, 9, 7), crown2 = new THREE.ConeGeometry(2.0, 6, 7), trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 3, 6);
        const greens = [0x2f5a2c, 0x3f7036, 0x355f30, 0x4a7a3a];
        const crowns = greens.map((c) => new THREE.InstancedMesh(crownGeo, lambert(c), trees.length));
        const tops = greens.map((c) => new THREE.InstancedMesh(crown2, lambert(c), trees.length));
        const trunks = new THREE.InstancedMesh(trunkGeo, lambert(0x5b4128), trees.length);
        const n = greens.map(() => 0);
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
        trees.forEach(([x, y, z, s, r], i) => {
            const k = Math.floor(r * greens.length);
            m4.compose(new THREE.Vector3(x, y + 1.5 * s, z), q, new THREE.Vector3(s, s, s)); trunks.setMatrixAt(i, m4);
            m4.compose(new THREE.Vector3(x, y + 7 * s, z), q, new THREE.Vector3(s, s, s)); crowns[k].setMatrixAt(n[k], m4);
            m4.compose(new THREE.Vector3(x, y + 11 * s, z), q, new THREE.Vector3(s, s, s)); tops[k].setMatrixAt(n[k]++, m4);
        });
        for (const [i, mesh] of crowns.entries()) { mesh.count = n[i]; tops[i].count = n[i]; }
        for (const mesh of [...crowns, ...tops, trunks]) { mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); }
    }

    window.renderYard = function (data, view) {
        if (!renderer) {
            renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("c"), antialias: true, preserveDrawingBuffer: true });
            renderer.setPixelRatio(window.devicePixelRatio);
            renderer.setSize(W, H);
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x9cc3e0);
        scene.fog = new THREE.Fog(0xb9d3e6, 500, 1300);

        // the sea round the coast, just under the beach
        const sea = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), lambert(0x2a6f9a));
        sea.rotation.x = -Math.PI / 2; sea.position.y = 0.2; scene.add(sea);

        for (const [k, tri] of Object.entries(data.ground)) scene.add(meshFrom(tri, col(data.colours[k] || [0.42, 0.52, 0.27], 1.05)));
        for (const [k, tri] of Object.entries(data.buildings)) if (tri.length) scene.add(meshFrom(tri, col(data.colours[k] || [0.7, 0.7, 0.7]), true, true));
        for (const r of data.roads) {
            const track = r.kind === "track";
            scene.add(strip(r.pts, r.width + 1.2, track ? 0x8a7a5a : 0x9a9a92, 0.02));          // kerb / verge
            scene.add(strip(r.pts, r.width, track ? 0x9a8460 : 0x4a4d50, 0.05));
            if (r.kind === "highway" || r.kind === "arterial") scene.add(strip(r.pts, 0.35, 0xe2b93b, 0.08, 6));
        }
        buildYard(scene, data.yard);
        buildTrees(scene, data.trees);

        scene.add(new THREE.HemisphereLight(0xdfefff, 0x5a6b3a, 0.75));
        const sun = new THREE.DirectionalLight(0xfff1d6, 1.05);
        sun.position.set(-220, 380, 260); sun.target.position.set(0, 0, 0);
        sun.castShadow = true;
        sun.shadow.mapSize.set(4096, 4096);
        Object.assign(sun.shadow.camera, { left: -420, right: 420, top: 420, bottom: -420, near: 10, far: 1400 });
        sun.shadow.bias = -0.0004;
        scene.add(sun, sun.target);

        const Y = data.yard.fence;
        const cam = new THREE.PerspectiveCamera(view === "top" ? 38 : 40, W / H, 1, 3000);
        if (view === "top") { cam.position.set(Y.x, Y.y + 640, Y.z + 120); cam.lookAt(Y.x, Y.y, Y.z); }
        else { cam.position.set(Y.x + 250, Y.y + 170, Y.z + 300); cam.lookAt(Y.x - 10, Y.y + 4, Y.z - 30); }
        renderer.render(scene, cam);
    };
})();
