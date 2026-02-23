const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SecurityLogSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        index: true,
    },
    adminId: {
        type: Schema.Types.ObjectId,
        ref: 'Admin',
        index: true,
    },
    organizerId: {
        type: Schema.Types.ObjectId,
        ref: 'Organizer',
        index: true,
    },
    email: { 
        type: String, 
        required: true 
    }, // Denormalized for easy viewing
    action: {
        type: String,
        required: true,
        enum: [
            'REGISTER_SUCCESS',
            'LOGIN_SUCCESS',
            'LOGIN_FAILED',
            'LOGIN_2FA_STARTED',
            'LOGOUT',
            'LOGOUT_ALL',
            'PASSWORD_CHANGED',
            'PASSWORD_RESET_REQUESTED',
            'PASSWORD_RESET_COMPLETED',
            'STAFF_ONBOARDED',
            'SETTINGS_UPDATED',
            '2FA_ENABLED',    
            '2FA_DISABLED',  
            'ACCOUNT_UPGRADED',
            'ACCOUNT_SUSPENDED',
            'ACCOUNT_DELETED'
        ]
    },
    ipAddress: { type: String },
    userAgent: { type: String },
    details: { type: String }, // e.g., "Failed login attempt from 203.0.113.1"
}, {
    timestamps: { createdAt: true, updatedAt: false },
});

// Indexes for efficient querying
SecurityLogSchema.index({ createdAt: -1 });
SecurityLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('SecurityLog', SecurityLogSchema);