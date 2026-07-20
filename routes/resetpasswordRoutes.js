const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// ==================== EMAIL CONFIGURATION ====================
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
        user: 'tharunkumarreddy1212@gmail.com',
        pass: 'cglm sfpj sphy rtqh'
    },
    tls: {
        rejectUnauthorized: false
    }
});

transporter.verify((error, success) => {
    if (error) {
        console.error('❌ Email configuration error:', error);
    } else {
        console.log('✅ Email server is ready to send messages');
    }
});

// ==================== HELPER FUNCTIONS ====================

const generateOTP = () => {
    return crypto.randomInt(100000, 999999).toString();
};

const sendOTPEmail = async (email, otp) => {
    try {
        const mailOptions = {
            from: `"Admin Panel" <tharunkumarreddy1212@gmail.com>`,
            to: email,
            subject: 'Password Reset OTP',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
                    <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <h2 style="color: #2563eb; text-align: center; margin-bottom: 20px;">Password Reset</h2>
                        <p style="color: #333; font-size: 16px; line-height: 1.5;">Hello,</p>
                        <p style="color: #333; font-size: 16px; line-height: 1.5;">You have requested to reset your password for the admin panel.</p>
                        <p style="color: #333; font-size: 16px; line-height: 1.5;">Use the following OTP to verify your identity:</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <div style="display: inline-block; background-color: #2563eb; color: white; padding: 15px 40px; border-radius: 8px; font-size: 32px; font-weight: bold; letter-spacing: 5px;">
                                ${otp}
                            </div>
                        </div>
                        <p style="color: #666; font-size: 14px; line-height: 1.5;">This OTP is valid for 5 minutes. If you didn't request this, please ignore this email.</p>
                        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                        <p style="color: #999; font-size: 12px; text-align: center;">This is an automated message, please do not reply.</p>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log('✅ Email sent successfully');
        return true;
    } catch (error) {
        console.error('❌ Email send error:', error);
        return false;
    }
};

const sendConfirmationEmail = async (email) => {
    try {
        const mailOptions = {
            from: `"Admin Panel" <tharunkumarreddy1212@gmail.com>`,
            to: email,
            subject: 'Password Reset Successful',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
                    <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <h2 style="color: #10b981; text-align: center; margin-bottom: 20px;">✅ Password Reset Successful</h2>
                        <p style="color: #333; font-size: 16px; line-height: 1.5;">Hello,</p>
                        <p style="color: #333; font-size: 16px; line-height: 1.5;">Your password has been successfully reset for the admin panel.</p>
                        <p style="color: #333; font-size: 16px; line-height: 1.5;">If you didn't perform this action, please contact support immediately.</p>
                        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                        <p style="color: #999; font-size: 12px; text-align: center;">This is an automated message, please do not reply.</p>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log('✅ Confirmation email sent');
        return true;
    } catch (error) {
        console.error('❌ Confirmation email error:', error);
        return false;
    }
};

// ==================== ROUTES ====================

// 1. Forgot Password - Send OTP
router.post('/forgot-password', async (req, res) => {
    console.log('📧 Forgot password request received');
    
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        // Check if admin exists
        const [adminResults] = await db.query(
            'SELECT id, email FROM admin WHERE email = ?',
            [email]
        );

        if (adminResults.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No account found with this email address'
            });
        }

        // Generate OTP
        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        // Delete any existing reset entries for this email
        await db.query('DELETE FROM password_resets WHERE email = ?', [email]);

        // Insert new reset entry (without token)
        await db.query(
            'INSERT INTO password_resets (email, otp, expires_at) VALUES (?, ?, ?)',
            [email, otp, expiresAt]
        );

        console.log(`✅ OTP generated for ${email}: ${otp}`);

        // Send OTP via email
        const emailSent = await sendOTPEmail(email, otp);

        if (!emailSent) {
            await db.query('DELETE FROM password_resets WHERE email = ?', [email]);
            return res.status(500).json({
                success: false,
                message: 'Failed to send OTP. Please try again later.'
            });
        }

        res.json({
            success: true,
            message: 'OTP sent successfully to your email'
        });

    } catch (error) {
        console.error('❌ Forgot password error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error: ' + error.message
        });
    }
});

// 2. Verify OTP
router.post('/verify-otp', async (req, res) => {
    console.log('🔐 OTP verification request received');
    
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Email and OTP are required'
            });
        }

        // Get the reset entry
        const [results] = await db.query(
            'SELECT * FROM password_resets WHERE email = ? AND otp = ?',
            [email, otp]
        );

        if (results.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid OTP'
            });
        }

        const resetEntry = results[0];

        // Check if OTP is expired
        const now = new Date();
        const expiresAt = new Date(resetEntry.expires_at);

        if (now > expiresAt) {
            await db.query('DELETE FROM password_resets WHERE id = ?', [resetEntry.id]);
            return res.status(400).json({
                success: false,
                message: 'OTP has expired. Please request a new one.'
            });
        }

        console.log(`✅ OTP verified for ${email}`);

        res.json({
            success: true,
            message: 'OTP verified successfully'
        });

    } catch (error) {
        console.error('❌ Verify OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error: ' + error.message
        });
    }
});

// 3. Reset Password - No token needed, just email
router.post('/reset-password', async (req, res) => {
    console.log('🔑 Reset password request received');
    
    try {
        const { email, newPassword } = req.body;

        if (!email || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Email and new password are required'
            });
        }

        // Check if there's a valid OTP entry for this email
        const [results] = await db.query(
            'SELECT * FROM password_resets WHERE email = ?',
            [email]
        );

        if (results.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No OTP verification found. Please request OTP again.'
            });
        }

        const resetEntry = results[0];

        // Check if OTP is still valid (not expired)
        const now = new Date();
        const expiresAt = new Date(resetEntry.expires_at);

        if (now > expiresAt) {
            await db.query('DELETE FROM password_resets WHERE id = ?', [resetEntry.id]);
            return res.status(400).json({
                success: false,
                message: 'OTP has expired. Please request a new one.'
            });
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update admin password
        await db.query(
            'UPDATE admin SET password = ? WHERE email = ?',
            [hashedPassword, email]
        );

        // Delete the reset entry after successful reset
        await db.query('DELETE FROM password_resets WHERE email = ?', [email]);

        console.log(`✅ Password reset successfully for ${email}`);

        // Send confirmation email
        sendConfirmationEmail(email).catch(err => console.error('Confirmation email error:', err));

        res.json({
            success: true,
            message: 'Password reset successfully'
        });

    } catch (error) {
        console.error('❌ Reset password error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error: ' + error.message
        });
    }
});

// 4. Resend OTP
router.post('/resend-otp', async (req, res) => {
    console.log('🔄 Resend OTP request received');
    
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        // Check if admin exists
        const [adminResults] = await db.query(
            'SELECT id, email FROM admin WHERE email = ?',
            [email]
        );

        if (adminResults.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No account found with this email address'
            });
        }

        // Generate new OTP
        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        // Delete old entry and insert new one
        await db.query('DELETE FROM password_resets WHERE email = ?', [email]);
        await db.query(
            'INSERT INTO password_resets (email, otp, expires_at) VALUES (?, ?, ?)',
            [email, otp, expiresAt]
        );

        console.log(`🔄 New OTP generated for ${email}: ${otp}`);

        // Send OTP via email
        const emailSent = await sendOTPEmail(email, otp);

        if (!emailSent) {
            await db.query('DELETE FROM password_resets WHERE email = ?', [email]);
            return res.status(500).json({
                success: false,
                message: 'Failed to send OTP. Please try again later.'
            });
        }

        res.json({
            success: true,
            message: 'New OTP sent successfully'
        });

    } catch (error) {
        console.error('❌ Resend OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error: ' + error.message
        });
    }
});

// 5. Clean up expired entries
router.delete('/cleanup-expired', async (req, res) => {
    try {
        const [result] = await db.query(
            'DELETE FROM password_resets WHERE expires_at < NOW()'
        );
        
        res.json({
            success: true,
            message: `Cleaned up ${result.affectedRows} expired entries`
        });
    } catch (error) {
        console.error('❌ Cleanup error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

module.exports = router;