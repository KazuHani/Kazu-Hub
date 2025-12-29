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

});
