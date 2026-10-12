(() => {
    const canvas = document.querySelector('.city-globe');
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const section = canvas.closest('.places-block');
    const stage = canvas.parentElement;
    const buttons = [...section.querySelectorAll('[data-globe-city]')];
    const links = [...section.querySelectorAll('.globe-cities a')];
    const distances = [...section.querySelectorAll('.globe-distances span')].map(span => span.textContent);
    const texture = document.createElement('canvas');
    texture.width = 840;
    texture.height = 420;
    const textureContext = texture.getContext('2d', { willReadFrequently: true });
    if (!textureContext) return;

    // Locally bundled, simplified coastlines with rounded corners retain the
    // abstract style while keeping every continent geographically recognizable.
    const landShapes = (window.homeGlobeLandPaths || []).map(shape => new Path2D(shape));
    const cities = [
        { name: 'Taoyuan', longitude: 121.3, latitude: 25.0, label: [24, 32] },
        { name: 'Taipei', longitude: 121.6, latitude: 25.0, label: [24, -28] },
        { name: 'Culver', longitude: -86.4, latitude: 41.2, label: [-85, -22] },
        { name: 'New York', longitude: -74.0, latitude: 40.7, label: [18, 26] },
        { name: 'Hong Kong SAR', longitude: 114.2, latitude: 22.3, label: [-145, 52] }
    ];
    cities.forEach((city, index) => {
        city.longitude *= Math.PI / 180;
        city.latitude *= Math.PI / 180;
        city.vector = [
            Math.cos(city.latitude) * Math.sin(city.longitude),
            Math.sin(city.latitude),
            Math.cos(city.latitude) * Math.cos(city.longitude)
        ];
        city.link = links[index];
    });

    const colors = {};
    const camera = { longitude: 1.96, latitude: 0.38, selected: 0 };
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let texturePixels;
    let size = 360;
    let center = 180;
    let radius = 140;
    let hitTargets = [];
    let drag = null;
    let frameRequested = false;
    let rotation = null;
    let hoveredCity = -1;

    function buildTexture() {
        const probe = document.createElement('span');
        probe.hidden = true;
        stage.append(probe);
        const properties = {
            paper: '--paper', ink: '--ink', accent: '--accent', warm: '--accent-warm',
            ocean: '--globe-ocean', land: '--globe-land', grid: '--globe-grid',
            edge: '--globe-edge', shadow: '--globe-shadow'
        };
        for (const [name, property] of Object.entries(properties)) {
            probe.style.color = `var(${property})`;
            colors[name] = getComputedStyle(probe).color;
        }
        probe.remove();
        textureContext.fillStyle = colors.ocean;
        textureContext.fillRect(0, 0, 840, 420);
        textureContext.strokeStyle = colors.grid;
        textureContext.lineWidth = 0.8;
        textureContext.beginPath();
        for (let x = 0; x <= 840; x += 70) {
            textureContext.moveTo(x, 0);
            textureContext.lineTo(x, 420);
        }
        for (let y = 0; y <= 420; y += 70) {
            textureContext.moveTo(0, y);
            textureContext.lineTo(840, y);
        }
        textureContext.stroke();
        for (const shape of landShapes) {
            textureContext.fillStyle = colors.land;
            textureContext.fill(shape);
            textureContext.strokeStyle = colors.edge;
            textureContext.lineWidth = 1;
            textureContext.stroke(shape);
        }
        texturePixels = textureContext.getImageData(0, 0, 840, 420).data;
    }

    function project(vector, scale = 1) {
        const sine = Math.sin(camera.longitude);
        const cosine = Math.cos(camera.longitude);
        const x = vector[0] * cosine - vector[2] * sine;
        const z = vector[0] * sine + vector[2] * cosine;
        return {
            x: center + x * radius * scale,
            y: center - (vector[1] * Math.cos(camera.latitude) - z * Math.sin(camera.latitude)) * radius * scale,
            z: vector[1] * Math.sin(camera.latitude) + z * Math.cos(camera.latitude)
        };
    }

    function interpolate(a, b, fraction) {
        const dot = Math.max(-1, Math.min(1, a.reduce((sum, value, i) => sum + value * b[i], 0)));
        const angle = Math.acos(dot);
        const denominator = Math.sin(angle);
        if (Math.abs(denominator) < 0.00001) return a;
        const from = Math.sin((1 - fraction) * angle) / denominator;
        const to = Math.sin(fraction * angle) / denominator;
        return a.map((value, i) => value * from + b[i] * to);
    }

    function routePoint(route, fraction) {
        const vector = interpolate(cities[route].vector, cities[route + 1].vector, fraction);
        // Keep the local Taiwan hop close to the surface, rather than drawing
        // an exaggerated detour to create space for its mileage label.
        const elevation = route === 0 ? 0.004 : 0.09;
        return project(vector, 1 + Math.sin(Math.PI * fraction) * elevation);
    }

    function overlaps(a, b, padding) {
        return a.x < b.x + b.width + padding && a.x + a.width + padding > b.x && a.y - a.height < b.y + padding && a.y + padding > b.y - b.height;
    }

    function draw() {
        context.clearRect(0, 0, size, size);
        const image = context.createImageData(size, size);
        const data = image.data;
        const cy = Math.cos(camera.longitude), sy = Math.sin(camera.longitude);
        const cp = Math.cos(camera.latitude), sp = Math.sin(camera.latitude);
        // Inverse-project the visible hemisphere into the abstract texture.
        for (let row = Math.ceil(center - radius); row < center + radius; row++) {
            const y = (center - row) / radius;
            for (let column = Math.ceil(center - radius); column < center + radius; column++) {
                const x = (column - center) / radius;
                const depthSquared = 1 - x * x - y * y;
                if (depthSquared <= 0) continue;
                const z = Math.sqrt(depthSquared);
                const worldY = y * cp + z * sp;
                const rear = y * sp - z * cp;
                const worldX = x * cy - rear * sy;
                const worldZ = -x * sy - rear * cy;
                const u = Math.min(839, Math.max(0, Math.floor((Math.atan2(worldX, worldZ) + Math.PI) / (2 * Math.PI) * 840)));
                const v = Math.min(419, Math.max(0, Math.floor((Math.PI / 2 - Math.asin(Math.max(-1, Math.min(1, worldY)))) / Math.PI * 420)));
                const source = (v * 840 + u) * 4;
                const destination = (row * size + column) * 4;
                const light = 0.77 + 0.23 * Math.max(0, -x * 0.35 + y * 0.4 + z * 0.85);
                for (let channel = 0; channel < 3; channel++) data[destination + channel] = texturePixels[source + channel] * light;
                data[destination + 3] = Math.min(255, depthSquared * radius * 200);
            }
        }
        context.putImageData(image, 0, 0);
        context.save();
        context.fillStyle = colors.shadow;
        context.globalAlpha = 0.18;
        context.filter = 'blur(9px)';
        context.beginPath();
        context.ellipse(center, center + radius + 8, radius * 0.63, 7, 0, 0, Math.PI * 2);
        context.fill();
        context.restore();

        const unit = size / Math.max(canvas.getBoundingClientRect().width, 1);
        const routes = [];
        context.strokeStyle = colors.accent;
        context.lineWidth = 1.5;
        context.setLineDash([3, 5]);
        for (let route = 0; route < cities.length - 1; route++) {
            const samples = [];
            context.beginPath();
            let connected = false;
            for (let step = 0; step <= 100; step++) {
                const fraction = step / 100;
                const point = routePoint(route, fraction);
                samples.push({ ...point, fraction });
                if (point.z > 0) {
                    if (connected) context.lineTo(point.x, point.y);
                    else context.moveTo(point.x, point.y);
                    connected = true;
                } else connected = false;
            }
            context.stroke();
            routes.push(samples);
        }
        context.setLineDash([]);

        const labelBoxes = [];
        context.font = `500 ${16 * unit}px Inter, "Segoe UI", sans-serif`;
        hitTargets = [];
        cities.forEach((city, index) => {
            const point = project(city.vector, 1.012);
            if (point.z < 0.025) return;
            const selected = index === camera.selected;
            const text = `${city.name} ↗`;
            const width = context.measureText(text).width;
            const height = 25 * unit;
            const x = Math.max(4, Math.min(size - width - 4, point.x + city.label[0] * unit));
            let y = Math.max(height, Math.min(size - 4, point.y + city.label[1] * unit));
            for (let attempt = 0; attempt < 7 && labelBoxes.some(box => overlaps({ x, y, width, height }, box, 4 * unit)); attempt++) y += height;
            y = Math.min(size - 4, y);
            labelBoxes.push({ x, y, width, height });
            context.beginPath();
            context.moveTo(point.x, point.y);
            context.lineTo(x < point.x ? x + width : x, y - 4 * unit);
            context.strokeStyle = colors.edge;
            context.lineWidth = 0.8 * unit;
            context.stroke();
            context.beginPath();
            context.arc(point.x, point.y, (selected ? 4 : 2.8) * unit, 0, Math.PI * 2);
            context.fillStyle = selected ? colors.warm : colors.accent;
            context.fill();
            context.lineWidth = 1.5 * unit;
            context.strokeStyle = colors.paper;
            context.stroke();
            context.lineWidth = 4 * unit;
            context.strokeText(text, x, y);
            const linkColor = index === hoveredCity ? colors.warm : colors.accent;
            context.fillStyle = linkColor;
            context.fillText(text, x, y);
            context.beginPath();
            context.moveTo(x, y + 4 * unit);
            context.lineTo(x + width, y + 4 * unit);
            context.lineWidth = unit;
            context.strokeStyle = linkColor;
            context.stroke();
            hitTargets.push({ ...point, index, label: { x, y, width, height } });
        });

        context.font = `${12 * unit}px "IBM Plex Mono", Consolas, monospace`;
        routes.forEach((samples, route) => {
            const text = distances[route];
            const width = context.measureText(text).width;
            const height = 15 * unit;
            const candidates = samples.filter(point => point.z > 0.08 && point.fraction >= 0.15 && point.fraction <= 0.85).sort((a, b) => Math.abs(a.fraction - 0.5) - Math.abs(b.fraction - 0.5));
            let position;
            for (const point of candidates) {
                // The short hop is smaller than its text. Place its mileage
                // beside the endpoints without expanding the route itself.
                const box = { x: route === 0 ? point.x + 12 * unit : point.x - width / 2, y: route === 0 ? point.y : point.y + 4 * unit, width, height };
                if (box.x < 8 * unit || box.x + width > size - 8 * unit || box.y - height < 8 * unit || box.y > size - 8 * unit) continue;
                if (!labelBoxes.some(other => overlaps(box, other, 4 * unit))) { position = box; break; }
            }
            if (!position) return;
            labelBoxes.push(position);
            context.strokeStyle = colors.paper;
            context.lineWidth = 6 * unit;
            context.strokeText(text, position.x, position.y);
            context.fillStyle = colors.warm;
            context.fillText(text, position.x, position.y);
        });
        canvas.dataset.globeReady = 'true';
    }

    function schedule() {
        if (frameRequested) return;
        frameRequested = true;
        requestAnimationFrame(time => {
            frameRequested = false;
            if (rotation) {
                const fraction = Math.min(1, (time - rotation.start) / 380);
                const ease = 1 - (1 - fraction) ** 3;
                camera.longitude = rotation.fromLongitude + rotation.longitudeChange * ease;
                camera.latitude = rotation.fromLatitude + rotation.latitudeChange * ease;
                if (fraction === 1) rotation = null;
            }
            draw();
            if (rotation) schedule();
        });
    }

    function resize() {
        const width = canvas.getBoundingClientRect().width;
        if (!width) return;
        size = Math.min(560, Math.max(280, Math.round(width * Math.min(devicePixelRatio || 1, 1.5))));
        canvas.width = size;
        canvas.height = size;
        center = size / 2;
        radius = size * 0.38;
        schedule();
    }

    function select(index) {
        const city = cities[index];
        camera.selected = index;
        buttons.forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.globeCity) === index)));
        const delta = Math.atan2(Math.sin(city.longitude - camera.longitude), Math.cos(city.longitude - camera.longitude));
        if (reducedMotion.matches) {
            rotation = null;
            camera.longitude += delta;
            camera.latitude = city.latitude * 0.8;
        } else {
            rotation = { start: performance.now(), fromLongitude: camera.longitude, longitudeChange: delta, fromLatitude: camera.latitude, latitudeChange: city.latitude * 0.8 - camera.latitude };
        }
        schedule();
    }
    buttons.forEach(button => button.addEventListener('click', () => select(Number(button.dataset.globeCity))));

    function hitTest(event) {
        const bounds = canvas.getBoundingClientRect();
        const x = (event.clientX - bounds.left) / bounds.width * size;
        const y = (event.clientY - bounds.top) / bounds.height * size;
        const label = hitTargets.find(target => x >= target.label.x && x <= target.label.x + target.label.width && y >= target.label.y - target.label.height && y <= target.label.y + 5 * size / bounds.width);
        if (label) return label;
        const closest = [...hitTargets].sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
        return closest && Math.hypot(closest.x - x, closest.y - y) < 16 * size / bounds.width ? closest : null;
    }

    canvas.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        rotation = null;
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY, longitude: camera.longitude, latitude: camera.latitude, moved: false };
        canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', event => {
        if (!drag) {
            const target = hitTest(event);
            const index = target ? target.index : -1;
            canvas.style.cursor = target ? 'pointer' : 'grab';
            canvas.title = target ? cities[index].name : '';
            if (hoveredCity !== index) { hoveredCity = index; schedule(); }
            return;
        }
        if (drag.id !== event.pointerId) return;
        canvas.style.cursor = 'grabbing';
        const x = event.clientX - drag.x;
        const y = event.clientY - drag.y;
        if (Math.hypot(x, y) > 5) drag.moved = true;
        camera.longitude = drag.longitude - x * 0.012;
        camera.latitude = Math.max(-1.45, Math.min(1.45, drag.latitude + y * 0.009));
        schedule();
    });
    canvas.addEventListener('pointerup', event => {
        if (!drag || drag.id !== event.pointerId) return;
        const clicked = !drag.moved;
        drag = null;
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        if (!clicked) return;
        const target = hitTest(event);
        if (target) cities[target.index].link.click();
    });
    canvas.addEventListener('pointercancel', () => { drag = null; });
    canvas.addEventListener('lostpointercapture', () => { drag = null; });
    canvas.addEventListener('pointerleave', () => {
        canvas.style.cursor = drag ? 'grabbing' : 'grab';
        canvas.title = '';
        if (hoveredCity !== -1) { hoveredCity = -1; schedule(); }
    });

    buildTexture();
    new ResizeObserver(resize).observe(canvas);
    resize();
    document.fonts.ready.then(schedule);
})();
