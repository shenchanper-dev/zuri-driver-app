/**
 * Script to generate app icons from logo
 * Run with: node scripts/generate-icons.js
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const LOGO_PATH = path.join(ASSETS_DIR, 'logo-original.jpg');

async function generateIcons() {
    console.log('🎨 Generating app icons from logo...');

    // Icon sizes
    const icons = [
        { name: 'icon.png', size: 1024, background: '#FFFFFF' },
        { name: 'adaptive-icon.png', size: 1024, background: '#FFFFFF' },
        { name: 'splash-icon.png', size: 512, background: 'transparent' },
    ];

    for (const icon of icons) {
        try {
            const outputPath = path.join(ASSETS_DIR, icon.name);

            await sharp(LOGO_PATH)
                .resize(icon.size, icon.size, {
                    fit: 'contain',
                    background: icon.background === 'transparent'
                        ? { r: 0, g: 0, b: 0, alpha: 0 }
                        : { r: 255, g: 255, b: 255, alpha: 1 }
                })
                .png()
                .toFile(outputPath);

            console.log(`✅ Created ${icon.name} (${icon.size}x${icon.size})`);
        } catch (err) {
            console.error(`❌ Error creating ${icon.name}:`, err.message);
        }
    }

    // Create splash screen (larger, with padding)
    try {
        const splashPath = path.join(ASSETS_DIR, 'splash.png');

        // Create a white background with centered logo
        await sharp({
            create: {
                width: 1284,
                height: 2778,
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 1 }
            }
        })
            .composite([{
                input: await sharp(LOGO_PATH)
                    .resize(600, 600, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
                    .png()
                    .toBuffer(),
                gravity: 'center'
            }])
            .png()
            .toFile(splashPath);

        console.log('✅ Created splash.png (1284x2778)');
    } catch (err) {
        console.error('❌ Error creating splash.png:', err.message);
    }

    console.log('\n🎉 Icon generation complete!');
}

generateIcons();
