// ============================================
// Zentry Gaming — Interactive JavaScript
// ============================================

// === Preloader ===
window.addEventListener('load', () => {
    const preloader = document.getElementById('preloader');
    // Small delay for dramatic effect
    setTimeout(() => {
        preloader.classList.add('fade-out');
        setTimeout(() => preloader.style.display = 'none', 800);
    }, 1200);
});

// === Video Cycling ===
const nextButton = document.getElementById('next-btn');
const video = document.querySelector('.hero-video');
const movieList = ['videos/hero-1.mp4', 'videos/hero-2.mp4', 'videos/hero-3.mp4', 'videos/hero-4.mp4'];
let currentIndex = 0;

if (nextButton && video) {
    nextButton.addEventListener('click', () => {
        currentIndex = (currentIndex + 1) % movieList.length;
        
        // Smooth transition effect
        video.style.opacity = '0';
        video.style.transition = 'opacity 0.4s ease';
        
        setTimeout(() => {
            video.src = movieList[currentIndex];
            video.load();
            video.play().catch(() => {}); // Handle autoplay restrictions
            
            video.addEventListener('loadeddata', () => {
                video.style.opacity = '1';
            }, { once: true });
            
            // Fallback: show video even if loadeddata doesn't fire
            setTimeout(() => {
                video.style.opacity = '1';
            }, 600);
        }, 400);
    });
}

// === Scroll-Triggered Fade Animations ===
const fadeObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            // Add staggered delay for sibling elements
            const siblings = entry.target.parentElement.querySelectorAll('.fade-element');
            let delay = 0;
            siblings.forEach(sib => {
                if (sib === entry.target) {
                    entry.target.style.transitionDelay = `${delay * 0.1}s`;
                }
                delay++;
            });
            
            entry.target.classList.add('visible');
            fadeObserver.unobserve(entry.target);
        }
    });
}, {
    threshold: 0.15,
    rootMargin: '0px 0px -60px 0px'
});

document.querySelectorAll('.fade-element').forEach(el => {
    fadeObserver.observe(el);
});

// === Header Scroll Effect ===
const header = document.getElementById('main-header');
let lastScroll = 0;

window.addEventListener('scroll', () => {
    const currentScroll = window.scrollY;
    
    if (currentScroll > 80) {
        header.classList.add('scrolled');
    } else {
        header.classList.remove('scrolled');
    }
    
    lastScroll = currentScroll;
}, { passive: true });

// === Smooth Scroll for Nav Links ===
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
        const targetId = anchor.getAttribute('href');
        if (targetId === '#') return;
        
        const target = document.querySelector(targetId);
        if (target) {
            e.preventDefault();
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// === Card Tilt Effect (subtle) ===
document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        
        const rotateX = (y - centerY) / centerY * -3;
        const rotateY = (x - centerX) / centerX * 3;
        
        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    });
    
    card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0)';
        card.style.transition = 'transform 0.5s ease';
    });
    
    card.addEventListener('mouseenter', () => {
        card.style.transition = 'none';
    });
});

// === Parallax on Contact Images ===
const contactSection = document.querySelector('.contact-section');
if (contactSection) {
    const img1 = contactSection.querySelector('.img1');
    const img2 = contactSection.querySelector('.img2');
    const img3 = contactSection.querySelector('.img3');
    
    window.addEventListener('scroll', () => {
        const rect = contactSection.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
            const progress = (window.innerHeight - rect.top) / (window.innerHeight + rect.height);
            const offset = (progress - 0.5) * 40;
            
            if (img1) img1.style.transform = `translateY(${offset * 0.8}px)`;
            if (img2) img2.style.transform = `translateY(${offset * -0.5}px)`;
            if (img3) img3.style.transform = `translateY(${offset * 0.6}px)`;
        }
    }, { passive: true });
}