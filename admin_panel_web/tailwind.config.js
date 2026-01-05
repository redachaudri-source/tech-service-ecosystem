/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // Professional palette
                primary: '#0F172A', // Slate 900
                secondary: '#3B82F6', // Blue 500
                accent: '#F59E0B', // Amber 500
                danger: '#EF4444', // Red 500
                success: '#22C55E', // Green 500
            }
        },
    },
    plugins: [],
}
