(() => {
  window.initLampPullChain = function initLampPullChain() {
    if (window.__lampPullChainStarted) return;

    const pull = document.querySelector(".lamp-pull");
    if (!pull) return;
    window.__lampPullChainStarted = true;
    pull.dataset.physics = "weighted-slack-chain";

    const body = document.body;
    const cordShadow = pull.querySelector("[data-cord-shadow]");
    const cordChain = pull.querySelector("[data-cord-chain]");
    const cordGlint = pull.querySelector("[data-cord-glint]");
    const cordWeight = pull.querySelector("[data-cord-weight]");
    const weightSphere = cordWeight.querySelector(".lamp-cord-weight");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const anchor = { x: 25, y: 0 };
    const restingLength = 72;
    const maximumSwitchTravel = 9;
    const gravity = 940;
    const knob = { x: anchor.x, y: restingLength, vx: 0, vy: 0 };
    const requested = { x: knob.x, y: knob.y };

    let switchTravel = 0;
    let requestedSwitchTravel = 0;
    let slackSide = 1;
    let drag = null;
    let frame = null;
    let lastFrameTime = performance.now();

    function clamp(value, minimum, maximum) {
      return Math.min(maximum, Math.max(minimum, value));
    }

    function visibleLength() {
      return restingLength + switchTravel;
    }

    function setLamp(on) {
      body.classList.toggle("lamp-is-on", on);
      if (!on) {
        body.classList.remove("desktop-has-been-tried", "spotify-has-been-tried");
        document.dispatchEvent(new Event("spotify:reset"));
      }
      pull.setAttribute("aria-pressed", String(on));
      pull.setAttribute("aria-label", `Pull the chain to turn ${on ? "off" : "on"} the lamp and computer`);
    }

    function updateSphereGeometry() {
      const rect = pull.getBoundingClientRect();
      const scaleX = Math.max(0.001, rect.width / 50);
      const scaleY = Math.max(0.001, rect.height / 100);
      const radiusInPixels = 4.8;
      weightSphere.setAttribute("rx", (radiusInPixels / scaleX).toFixed(3));
      weightSphere.setAttribute("ry", (radiusInPixels / scaleY).toFixed(3));
    }

    function curvePoint(progress, amplitude, directionX, directionY) {
      const profile = 4 * progress * (1 - progress);
      return {
        x: anchor.x + (knob.x - anchor.x) * progress + directionX * amplitude * profile,
        y: anchor.y + (knob.y - anchor.y) * progress + directionY * amplitude * profile
      };
    }

    function sampledCurveLength(amplitude, directionX, directionY) {
      let length = 0;
      let previous = curvePoint(0, amplitude, directionX, directionY);
      for (let index = 1; index <= 24; index += 1) {
        const point = curvePoint(index / 24, amplitude, directionX, directionY);
        length += Math.hypot(point.x - previous.x, point.y - previous.y);
        previous = point;
      }
      return length;
    }

    function slackCurvePoints(chainLength, directDistance) {
      const horizontalSeparation = knob.x - anchor.x;
      if (Math.abs(horizontalSeparation) > 1.2) slackSide = Math.sign(horizontalSeparation);
      else if (Math.abs(knob.vx) > 2) slackSide = Math.sign(knob.vx);

      const verticalAlignment = clamp(1 - Math.abs(horizontalSeparation) / 18, 0, 1);
      const rawDirectionX = slackSide * verticalAlignment * 0.38;
      const rawDirectionY = 1;
      const directionMagnitude = Math.hypot(rawDirectionX, rawDirectionY);
      const directionX = rawDirectionX / directionMagnitude;
      const directionY = rawDirectionY / directionMagnitude;

      let lower = 0;
      let upper = Math.max(2, chainLength - directDistance);
      while (sampledCurveLength(upper, directionX, directionY) < chainLength && upper < chainLength * 2) {
        upper *= 1.8;
      }
      for (let iteration = 0; iteration < 18; iteration += 1) {
        const middle = (lower + upper) / 2;
        if (sampledCurveLength(middle, directionX, directionY) < chainLength) lower = middle;
        else upper = middle;
      }

      const amplitude = (lower + upper) / 2;
      return Array.from({ length: 19 }, (_, index) => {
        return curvePoint(index / 18, amplitude, directionX, directionY);
      });
    }

    function smoothPath(points) {
      const reversed = [...points].reverse();
      let path = `M${reversed[0].x.toFixed(2)} ${reversed[0].y.toFixed(2)}`;
      for (let index = 1; index < reversed.length - 1; index += 1) {
        const current = reversed[index];
        const next = reversed[index + 1];
        const middleX = (current.x + next.x) / 2;
        const middleY = (current.y + next.y) / 2;
        path += `Q${current.x.toFixed(2)} ${current.y.toFixed(2)} ${middleX.toFixed(2)} ${middleY.toFixed(2)}`;
      }
      const last = reversed[reversed.length - 1];
      return `${path}L${last.x.toFixed(2)} ${last.y.toFixed(2)}`;
    }

    function drawChain() {
      const chainLength = visibleLength();
      const directDistance = Math.hypot(knob.x - anchor.x, knob.y - anchor.y);
      let path;

      if (chainLength - directDistance > 0.2) {
        path = smoothPath(slackCurvePoints(chainLength, directDistance));
      } else {
        path = `M${knob.x.toFixed(2)} ${knob.y.toFixed(2)}L${anchor.x} ${anchor.y}`;
      }

      cordShadow.setAttribute("d", path);
      cordChain.setAttribute("d", path);
      cordGlint.setAttribute("d", path);
      cordWeight.setAttribute("transform", `translate(${knob.x.toFixed(2)} ${knob.y.toFixed(2)})`);
    }

    function constrainToChain() {
      const dx = knob.x - anchor.x;
      const dy = knob.y - anchor.y;
      const distance = Math.max(0.0001, Math.hypot(dx, dy));
      const chainLength = visibleLength();
      if (distance <= chainLength) return;

      const normalX = dx / distance;
      const normalY = dy / distance;
      knob.x = anchor.x + normalX * chainLength;
      knob.y = anchor.y + normalY * chainLength;

      const outwardVelocity = knob.vx * normalX + knob.vy * normalY;
      if (outwardVelocity > 0) {
        knob.vx -= normalX * outwardVelocity;
        knob.vy -= normalY * outwardVelocity;
      }
    }

    function simulate(step) {
      if (drag) {
        switchTravel += (requestedSwitchTravel - switchTravel) * (1 - Math.exp(-32 * step));
        const follow = 1 - Math.exp(-38 * step);
        const previousX = knob.x;
        const previousY = knob.y;
        knob.x += (requested.x - knob.x) * follow;
        knob.y += (requested.y - knob.y) * follow;
        constrainToChain();
        knob.vx = (knob.x - previousX) / step;
        knob.vy = (knob.y - previousY) / step;
        return;
      }

      switchTravel += (0 - switchTravel) * (1 - Math.exp(-23 * step));
      const airDamping = Math.exp(-6.4 * step);
      knob.vx *= airDamping;
      knob.vy = knob.vy * airDamping + gravity * step;
      knob.x += knob.vx * step;
      knob.y += knob.vy * step;
      constrainToChain();

      const distance = Math.hypot(knob.x - anchor.x, knob.y - anchor.y);
      if (visibleLength() - distance < 0.08) {
        const tangentialDamping = Math.exp(-5.8 * step);
        knob.vx *= tangentialDamping;
        knob.vy *= tangentialDamping;
      }
    }

    function startPhysics() {
      if (frame !== null) return;
      lastFrameTime = performance.now();
      frame = window.requestAnimationFrame(stepPhysics);
    }

    function snapToRest() {
      switchTravel = 0;
      requestedSwitchTravel = 0;
      knob.x = anchor.x;
      knob.y = restingLength;
      knob.vx = 0;
      knob.vy = 0;
      requested.x = knob.x;
      requested.y = knob.y;
      drawChain();
    }

    function stepPhysics(time) {
      frame = null;

      if (reducedMotion) {
        if (drag) {
          knob.x = requested.x;
          knob.y = requested.y;
          switchTravel = requestedSwitchTravel;
          constrainToChain();
          drawChain();
        } else {
          snapToRest();
        }
        return;
      }

      const elapsed = clamp((time - lastFrameTime) / 1000, 1 / 240, 1 / 30);
      lastFrameTime = time;
      const substeps = 6;
      for (let index = 0; index < substeps; index += 1) simulate(elapsed / substeps);
      drawChain();

      const distanceFromRest = Math.hypot(knob.x - anchor.x, knob.y - restingLength);
      const speed = Math.hypot(knob.vx, knob.vy);
      const stillMoving = drag || distanceFromRest > 0.035 || speed > 0.12 || switchTravel > 0.018;
      if (stillMoving) frame = window.requestAnimationFrame(stepPhysics);
      else snapToRest();
    }

    function resetPull(pointerId = null) {
      drag = null;
      requestedSwitchTravel = 0;
      pull.classList.remove("is-pulling");
      if (pointerId !== null) {
        try {
          if (pull.hasPointerCapture(pointerId)) pull.releasePointerCapture(pointerId);
        } catch (error) {
          // Safari may release capture before dispatching its cancellation event.
        }
      }
      startPhysics();
    }

    pull.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "touch" && event.button !== 0) return;
      event.preventDefault();
      const rect = pull.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        baseX: knob.x,
        baseY: knob.y,
        unitX: 50 / rect.width,
        unitY: 100 / rect.height,
        distance: 0,
        maximumTravel: 0
      };
      requested.x = knob.x;
      requested.y = knob.y;
      requestedSwitchTravel = switchTravel;
      pull.classList.add("is-pulling");
      try {
        pull.setPointerCapture(event.pointerId);
      } catch (error) {
        // Window-level release handling prevents a stuck chain without capture.
      }
      startPhysics();
    });

    pull.addEventListener("pointermove", (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      requested.x = clamp(drag.baseX + dx * drag.unitX, -55, 105);
      requested.y = clamp(drag.baseY + dy * drag.unitY, 10, 118);
      const requestedDistance = Math.hypot(requested.x - anchor.x, requested.y - anchor.y);
      requestedSwitchTravel = clamp(requestedDistance - restingLength, 0, maximumSwitchTravel);
      drag.distance = Math.max(drag.distance, Math.hypot(dx, dy));
      drag.maximumTravel = Math.max(drag.maximumTravel, requestedSwitchTravel);
      if (Math.abs(requested.x - anchor.x) > 1.2) slackSide = Math.sign(requested.x - anchor.x);
      startPhysics();
    });

    function finishPull(event) {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const completedDrag = drag;
      const shouldToggle = completedDrag.maximumTravel >= 2.7 || completedDrag.distance < 4;
      resetPull(event.pointerId);
      if (shouldToggle) setLamp(!body.classList.contains("lamp-is-on"));
    }

    window.addEventListener("pointerup", finishPull, true);
    window.addEventListener("pointercancel", (event) => {
      if (drag && drag.pointerId === event.pointerId) resetPull(event.pointerId);
    }, true);
    pull.addEventListener("lostpointercapture", (event) => {
      if (drag && drag.pointerId === event.pointerId) resetPull();
    });
    window.addEventListener("blur", () => {
      if (drag) resetPull(drag.pointerId);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && drag) resetPull(drag.pointerId);
    });

    pull.addEventListener("click", (event) => {
      if (event.detail !== 0) return;
      setLamp(!body.classList.contains("lamp-is-on"));
      switchTravel = maximumSwitchTravel * 0.72;
      startPhysics();
    });

    pull.setAttribute("aria-label", "Pull the chain to turn on the lamp and computer");
    updateSphereGeometry();
    window.addEventListener("resize", updateSphereGeometry, { passive: true });
    snapToRest();
  };
})();
