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
        // Gamma: Left/Right tilt (-90 to 90). Neutral ~0.
        // Beta: Front/Back tilt (-180 to 180). Neutral ~45 (holding phone).

        // Clamp and normalize values
        let x = event.gamma || 0; // -90 to 90
        let y = event.beta || 0;  // -180 to 180

        // Constrain for subtle effect
        // Max tilt range to consider: -30 to 30 degrees off center
        const MAX_TILT = 30;

        // Calibrate Y around 45 degrees (holding position)
        y = y - 45;

        // Clamp
        if (x > MAX_TILT) x = MAX_TILT;
        if (x < -MAX_TILT) x = -MAX_TILT;
        if (y > MAX_TILT) y = MAX_TILT;
        if (y < -MAX_TILT) y = -MAX_TILT;

        // Map to output rotation (mirroring desktop max of ~10deg)
        // Inverting signs to match "looking through window" effect usually desired
        const xRotation = (y / MAX_TILT) * -10; // Up/Down tilt
        const yRotation = (x / MAX_TILT) * 10;  // Left/Right tilt

        tiltElements.forEach(element => {
            // Apply similar transform but no specific "mouse position" spotlight 
            // properly (unless we simulated it, but simple tilt is enough for now)
            element.style.transform = `perspective(1000px) rotateX(${xRotation}deg) rotateY(${yRotation}deg)`;
        });
    }
});
