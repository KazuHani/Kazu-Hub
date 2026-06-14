/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './index.html',
        './features.js',
    ],
    safelist: [
        // Layout utilities used in index.html
        'flex', 'flex-col', 'flex-row', 'flex-wrap', 'flex-grow', 'flex-shrink-0',
        'flex-1', 'flex-none',
        'grid', 'grid-cols-1', 'grid-cols-2', 'grid-cols-3',
        'items-center', 'items-start', 'items-end',
        'justify-center', 'justify-between', 'justify-start', 'justify-end',
        'gap-1', 'gap-2', 'gap-3', 'gap-4', 'gap-6',
        // Positioning
        'relative', 'absolute', 'fixed', 'sticky',
        'inset-0', 'top-0', 'left-0', 'right-0', 'bottom-0',
        'z-10', 'z-50',
        // Sizing
        'w-full', 'w-auto', 'w-1/3', 'w-1/2', 'h-full', 'h-auto', 'h-screen',
        'min-h-screen', 'min-h-[44px]', 'min-w-[30%]',
        'max-w-[95rem]',
        'w-3.5', 'h-3.5', 'w-4', 'h-4', 'w-5', 'h-5', 'w-6', 'h-6',
        'w-8', 'h-8', 'w-10', 'h-10', 'w-12', 'h-12', 'w-14', 'h-14',
        'w-16', 'h-16', 'w-32', 'h-32', 'w-40', 'h-40', 'w-48', 'h-48',
        // Margins
        'mt-1', 'mt-2', 'mt-4', 'mt-5', 'mt-6', 'mt-8',
        'mb-1', 'mb-2', 'mb-3',
        'ml-0', 'ml-0.5', 'ml-2', 'mr-2', 'mr-10',
        'mx-auto', 'my-0',
        '-mt-10', '-mr-10', '-mb-10', '-ml-10', '-top-8', '-right-8', '-left-8',
        // Padding
        'p-2', 'p-3', 'p-4', 'p-5', 'p-6',
        'px-2', 'px-3', 'px-4', 'px-5', 'px-6', 'px-8',
        'py-1', 'py-1.5', 'py-2', 'py-3', 'py-4', 'py-6',
        'pt-4', 'pt-6', 'pb-4', 'pb-6',
        // Typography
        'text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl',
        'text-2xl', 'text-3xl', 'text-4xl', 'text-5xl', 'text-6xl', 'text-7xl',
        'text-[0.65rem]', 'text-[0.75rem]',
        'font-medium', 'font-semibold', 'font-bold',
        'tracking-wide', 'tracking-wider', 'tracking-widest', 'tracking-[0.35em]', 'tracking-[0.2em]',
        'leading-tight',
        'uppercase', 'lowercase', 'capitalize',
        'text-center', 'text-left', 'text-right',
        'truncate', 'line-clamp-2',
        // Colors
        'text-white', 'text-gray-400', 'text-gray-500',
        'text-slate-400', 'text-slate-900',
        'text-cyan-400', 'text-cyan-300', 'text-cyan-200',
        'text-cyan-400/80', 'text-cyan-300/80', 'text-cyan-400/40',
        'text-indigo-400', 'text-blue-400', 'text-sky-400',
        'text-sky-400/80', 'text-purple-400', 'text-purple-400/80',
        'text-pink-400', 'text-pink-400/80',
        'text-red-400', 'text-yellow-400', 'text-green-400', 'text-transparent',
        // Backgrounds
        'bg-black/30',
        'bg-[#070e1a]', 'bg-[#0a1526]/95', 'bg-[#030812]',
        'bg-white/5', 'bg-white/[0.06]', 'bg-white/10', 'bg-white/15',
        'bg-gradient-to-r', 'bg-gradient-to-br', 'bg-clip-text',
        'from-white', 'via-cyan-200', 'to-cyan-400',
        'from-slate-800', 'to-slate-900',
        'from-indigo-500/20', 'to-indigo-600/10',
        'from-blue-500/20', 'to-blue-600/10',
        'bg-blue-500/10', 'bg-cyan-500/10',
        'bg-slate-600/60', 'bg-slate-700/50',
        // Borders
        'border', 'border-0', 'border-2', 'border-4',
        'border-white/10', 'border-white/5', 'border-slate-900',
        'border-l', 'border-r', 'border-t', 'border-b', 'border-x',
        'rounded', 'rounded-md', 'rounded-lg', 'rounded-xl', 'rounded-2xl', 'rounded-full',
        // Overflow / Whitespace
        'overflow-hidden', 'overflow-x-auto', 'overflow-y-auto',
        'whitespace-nowrap', 'whitespace-pre-wrap',
        // Display
        'hidden', 'block', 'inline', 'inline-block', 'inline-flex', 'contents',
        // Cursor
        'cursor-pointer', 'cursor-default',
        // Effects
        'opacity-0', 'opacity-20', 'opacity-50', 'opacity-80', 'opacity-90',
        'shadow-2xl', 'shadow-lg', 'shadow-md',
        'blur-2xl', 'blur-3xl',
        'backdrop-blur-md', 'backdrop-blur-[24px]',
        'filter', 'drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)]',
        // Object
        'object-cover', 'object-contain',
        // Pointer events
        'pointer-events-none',
        // Scroll
        'scroll-snap-type', 'scroll-behavior',
        'overscroll-behavior',
        // Animations
        'animate-spin', 'animate-pulse', 'animate-bounce',
        'will-change-transform',
        // Transitions
        'transition', 'transition-all', 'transition-colors', 'transition-transform', 'transition-opacity',
        'duration-100', 'duration-200', 'duration-300', 'duration-500',
        'ease-in-out', 'ease-out',
        'ease-[cubic-bezier(0.34,1.56,0.64,1)]',
        // Transform
        'translate-x-full', 'translate-y-4', 'translate-y-20',
        '-translate-y-1/2',
        'rotate-6', 'rotate-3', '-rotate-3',
        'scale-90', 'scale-95', 'scale-105',
        // Hover/Focus/Active states
        'hover:bg-white/10', 'hover:bg-white/5', 'hover:text-white',
        'hover:text-cyan-400', 'hover:text-cyan-300',
        'active:scale-95',
        // Group
        'group', 'group/btn', 'group/profile',
        // Max height / dynamic push animation properties
        'max-h-0', 'max-h-12', 'mt-0', 'mb-0', 'mt-5', 'mb-1',
        // Visibility
        'visible', 'invisible',
        // Aspect ratio
        'aspect-ratio',
        // Min-height
        'min-h-[6.5rem]', 'min-h-[7rem]', 'min-h-[44px]',
        // Min-width
        'min-w-[30%]', 'min-w-[7rem]',
        // Max-width
        'max-w-[95rem]', 'max-w-full',
        // Columns
        'col-span-2', 'col-span-3', 'col-span-5', 'col-span-7',
        // Tab
        'tabular-nums',
        // Z-index
        'z-[100]', 'z-[1000]', 'z-[9999]',
    ],
}
