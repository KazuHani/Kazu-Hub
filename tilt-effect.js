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
        element.style.willChange = 'transform';
        // Initialize transition property to handle smooth resets
        element.style.transition = 'transform 0.1s ease-out';

        let rect = null;

        // Only attach mouse listeners if it's a hover device
        if (isHoverDevice) {
            element.addEventListener('mouseenter', () => {
                // Ensure snap transition is ready for movement
                element.style.transition = 'transform 0.1s ease-out';
                // Cache the bounding rect on mouseenter to prevent layout thrashing on mousemove
                rect = element.getBoundingClientRect();
            });

            element.addEventListener('mousemove', (e) => {
                if (!rect) {
                    rect = element.getBoundingClientRect();
                }
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                // Calculate percentages
                const xPct = x / rect.width;
                const yPct = y / rect.height;

                // Calculate rotation (Bare minimum 2 degree range)
                // Invert signs if needed for "looking at" feel vs "tipping" feel
                const xRotation = (yPct - 0.5) * -2;
                const yRotation = (xPct - 0.5) * 2;

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

                rect = null; // Clear cached rect
            });
        }
    });

    /* --- MAIN TITLE 3D FOLLOW EFFECT --- */
    const mainTitle = document.getElementById('kazu-title');
    if (mainTitle && isHoverDevice) {
        let titleCenter = { x: 0, y: 0 };
        function updateTitleCenter() {
            const rect = mainTitle.getBoundingClientRect();
            titleCenter.x = rect.left + rect.width / 2 + window.scrollX;
            titleCenter.y = rect.top + rect.height / 2 + window.scrollY;
        }

        // Initialize center
        updateTitleCenter();

        // Update center on resize/scroll
        window.addEventListener('resize', updateTitleCenter, { passive: true });
        window.addEventListener('scroll', updateTitleCenter, { passive: true });

        document.addEventListener('mousemove', (e) => {
            // Pivot around the title's own center for a "following eye" feel
            const viewportX = titleCenter.x - window.scrollX;
            const viewportY = titleCenter.y - window.scrollY;

            // Distance from center
            const deltaX = e.clientX - viewportX;
            const deltaY = e.clientY - viewportY;

            // Rotation Logic:
            // Mouse Right (+x) means title should look Right -> RotateY(+deg) [Left side goes back]
            // Mouse Down (+y) means title should look Down  -> RotateX(-deg) [Bottom goes back/Top comes forward? No wait]
            // RotateX(positive) = element top tilts away (into screen). Bottom tilts towards.
            // If I look down, my face tilts down. Top comes forward.
            // So if mouse is down, we want RotateX to be negative.

            // Dampening (Increased divisor = less movement)
            const rotateY = deltaX / 100; // Even more dampening
            const rotateX = -deltaY / 100; // Even more dampening

            // Clamp max angles (Bare minimum 2 degree range)
            const clampedY = Math.max(-2, Math.min(2, rotateY));
            const clampedX = Math.max(-2, Math.min(2, rotateX));

            mainTitle.style.transform = `perspective(1000px) rotateX(${clampedX}deg) rotateY(${clampedY}deg)`;
        });

        // Reset when mouse leaves window
        document.addEventListener('mouseleave', () => {
            mainTitle.style.transition = 'transform 0.5s ease-out';
            mainTitle.style.transform = 'perspective(1000px) rotateX(0) rotateY(0)';
            setTimeout(() => { mainTitle.style.transition = ''; }, 500);
        });
    }

});
