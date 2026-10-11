import React, { useEffect, useRef } from 'react';

export default function InteractiveSpotsBackground({ isDarkMode = false, children }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Mouse coordinates
    let mouse = {
      x: width / 2,
      y: height / 2,
      targetX: width / 2,
      targetY: height / 2,
      hasMoved: false,
    };

    const handleMouseMove = (e) => {
      mouse.targetX = e.clientX;
      mouse.targetY = e.clientY;
      mouse.hasMoved = true;
    };
    window.addEventListener('mousemove', handleMouseMove);

    // Spots configuration
    // Light mode: forest greens, golden sun flare, deep pine inspired by first image
    // Dark mode: iridescent spectral neon spots (chromatic aberration, cyan/rainbow-violet/lime/amber) inspired by second image
    const lightPalette = [
      { r: 24, g: 76, b: 50 },    // Deep pine green
      { r: 42, g: 110, b: 72 },   // Forest moss green
      { r: 218, g: 145, b: 45 },  // Warm sunlight amber
      { r: 79, g: 143, b: 96 },   // Foliage green
      { r: 180, g: 120, b: 40 },  // Golden dusk
    ];

    const darkPalette = [
      { r: 35, g: 215, b: 180 },  // Iridescent cyan / aqua
      { r: 160, g: 90, b: 245 },  // Spectral violet
      { r: 245, g: 170, b: 65 },  // Prism amber
      { r: 85, g: 230, b: 130 },  // Vibrant prismatic green
      { r: 70, g: 145, b: 255 },  // Metallic azure
    ];

    const palette = isDarkMode ? darkPalette : lightPalette;

    // Create 12 ambient floating spots
    const spotCount = 14;
    const spots = Array.from({ length: spotCount }).map((_, i) => {
      const color = palette[i % palette.length];
      const baseRadius = 140 + Math.random() * 180;
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        originX: Math.random() * width,
        originY: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        radius: baseRadius,
        baseRadius,
        color,
        // Sensitivity to mouse
        parallaxFactor: 0.04 + (i % 5) * 0.02,
        pulseSpeed: 0.015 + Math.random() * 0.02,
        pulseOffset: Math.random() * Math.PI * 2,
        alpha: isDarkMode ? (0.28 + Math.random() * 0.22) : (0.22 + Math.random() * 0.20),
      };
    });

    let time = 0;

    const render = () => {
      time += 0.02;
      // Smooth mouse follow
      mouse.x += (mouse.targetX - mouse.x) * 0.05;
      mouse.y += (mouse.targetY - mouse.y) * 0.05;

      // Base background color
      ctx.fillStyle = isDarkMode ? '#0a0d0c' : '#F7F5EE';
      ctx.fillRect(0, 0, width, height);

      spots.forEach((spot, i) => {
        // Natural gentle organic movement
        spot.originX += spot.vx;
        spot.originY += spot.vy;

        if (spot.originX < -150) spot.originX = width + 150;
        if (spot.originX > width + 150) spot.originX = -150;
        if (spot.originY < -150) spot.originY = height + 150;
        if (spot.originY > height + 150) spot.originY = -150;

        // Shift position relative to mouse offset from screen center
        const mouseOffsetX = (mouse.x - width / 2) * spot.parallaxFactor;
        const mouseOffsetY = (mouse.y - height / 2) * spot.parallaxFactor;

        spot.x = spot.originX + mouseOffsetX;
        spot.y = spot.originY + mouseOffsetY;

        // Pulsing radius
        const currentRadius = spot.baseRadius + Math.sin(time * spot.pulseSpeed + spot.pulseOffset) * 25;

        // Radial gradient glow
        const gradient = ctx.createRadialGradient(
          spot.x,
          spot.y,
          0,
          spot.x,
          spot.y,
          Math.max(10, currentRadius)
        );

        const { r, g, b } = spot.color;
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${spot.alpha})`);
        gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${spot.alpha * 0.45})`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(spot.x, spot.y, currentRadius, 0, Math.PI * 2);
        ctx.fill();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, [isDarkMode]);

  return (
    <div style={{ position: 'relative', minHeight: '100vh', width: '100%', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />
      <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh' }}>
        {children}
      </div>
    </div>
  );
}
