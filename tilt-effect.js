document.addEventListener('DOMContentLoaded', () => {
    // Check if device supports hover (mouse) to prevent interference with touch scrolling
    // Check if device supports hover (mouse) for MOUSE-based tilt
    const isHoverDevice = window.matchMedia && window.matchMedia('(hover: hover)').matches;

    // Select all potential targets: Glass Panels and Glass Cards
    const tiltElements = document.querySelectorAll('.glass-panel, .glass-card');

    if (!tiltElements.length) return;

    tiltElements.forEach(element => {
        // Add necessary styles for 3D preservation
        element.style.transformStyle = 'preserve-3d';
        // Initialize transition property to handle smooth resets
        element.style.transition = 'transform 0.1s ease-out';

        // Only attach mouse listeners if it's a hover device
        if (isHoverDevice) {
            element.addEventListener('mousemove', (e) => {
                const rect = element.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                // Calculate percentages
                const xPct = x / rect.width;
                const yPct = y / rect.height;

                // Calculate rotation (max 10 degrees)
                // Invert signs if needed for "looking at" feel vs "tipping" feel
                const xRotation = (yPct - 0.5) * -10;
                const yRotation = (xPct - 0.5) * 10;

                // Set CSS variables for spotlight effect
                element.style.setProperty('--mouse-x', `${x}px`);
                element.style.setProperty('--mouse-y', `${y}px`);

                // Apply transform directly for responsiveness
                // scale(1.02) adds the "lift" effect replacing the CSS hover lift
                element.style.transform = `perspective(1000px) rotateX(${xRotation}deg) rotateY(${yRotation}deg) scale(1.02)`;
            });

            element.addEventListener('mouseleave', () => {
                // Smooth reset
                element.style.transition = 'transform 0.5s ease-out';
                element.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale(1)';

                // Reset transition speed after the smooth return
                setTimeout(() => {
                    element.style.transition = 'transform 0.1s ease-out';
                }, 500);
            });

            element.addEventListener('mouseenter', () => {
                // Ensure snap transition is ready for movement
                element.style.transition = 'transform 0.1s ease-out';
            });
        }
    });
    // --- MOBILE/GYROSCOPE LOGIC ---

    // Helper to request permission (iOS 13+)
    const requestMotionPermission = async () => {
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const permissionState = await DeviceOrientationEvent.requestPermission();
                if (permissionState === 'granted') {
                    window.addEventListener('deviceorientation', handleMobileTilt);
                } else {
                    console.log("Motion permission denied");
                }
            } catch (error) {
                console.error("Error requesting motion permission:", error);
            }
        } else {
            // Non-iOS or older devices usually don't need permission
            window.addEventListener('deviceorientation', handleMobileTilt);
        }
        // Remove self after first interaction attempt
        document.body.removeEventListener('click', requestMotionPermission);
        document.body.removeEventListener('touchstart', requestMotionPermission);
    };

    // Attach to first interaction
    document.body.addEventListener('click', requestMotionPermission, { once: true });
    document.body.addEventListener('touchstart', requestMotionPermission, { once: true });

    // Try auto-enabling for non-iOS devices immediately
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission !== 'function') {
        window.addEventListener('deviceorientation', handleMobileTilt);
    }

    function handleMobileTilt(event) {
        // Vertical Zone Logic: Center around 90 degrees (Vertical)
        // We want the effect to be active near 90, and fade to 0 intensity as you move away.
        // This prevents "sticking" when holding at other angles.

        const centerBeta = 90;
        const tiltRange = 30; // Degrees from center where effect is active

        // Calculate distance from vertical
        const dist = Math.abs((event.beta || 0) - centerBeta);

        // Calculate Intensity (1.0 at center, 0.0 at edge of range)
        let intensity = 1 - (dist / tiltRange);
        if (intensity < 0) intensity = 0;
        if (intensity > 1) intensity = 1;

        // Raw tilt relative to vertical
        // We use a wider clamp for the raw calculation so the movement inside the zone is linear
        let rawY = (event.beta || 0) - centerBeta;
        let rawX = event.gamma || 0;

        // Apply clamping to raw values to keep them sane within the active window
        if (rawY > tiltRange) rawY = tiltRange;
        if (rawY < -tiltRange) rawY = -tiltRange;
        if (rawX > tiltRange) rawX = tiltRange;
        if (rawX < -tiltRange) rawX = -tiltRange;

        // Calculate final rotation
        // Invert signs for "looking through window" feel
        // Apply INTENSITY to fade effect to 0 when not vertical
        const xRotation = (rawY / tiltRange) * -15 * intensity;
        const yRotation = (rawX / tiltRange) * 15 * intensity;

        tiltElements.forEach(element => {
            element.style.transform = `perspective(1000px) rotateX(${xRotation}deg) rotateY(${yRotation}deg)`;
        });
    }
});
