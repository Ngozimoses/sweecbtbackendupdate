const mongoose = require('mongoose');

const RefreshTokenSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'userModel',
    required: true,
  },
  userModel: {
    type: String,
    required: true,
    enum: [
      'User',           // For student/teacher/admin users
      'Admin',          // System admin
      'Administrator',  // Staff admin
      'Moderator',      // Staff moderator
      'SupportAgent',   // Staff support-agent (use PascalCase for model names)
      'ContentEditor',  // Staff content-editor
      'FinanceManager', // Staff finance-manager
      'Client',         // Client users
      'Organizer'       // Event organizers
    ],
  },
  // Store BOTH the selector (for lookup) and verifier (for validation)
  tokenSelector: {
    type: String,
    required: true,
    unique: true,
    index: true, // Fast lookups
  },
  tokenVerifier: {
    type: String,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true, // For TTL and cleanup
  },
  userAgent: {
    type: String,
    default: 'unknown',
  },
  ipAddress: {
    type: String,
    default: 'unknown',
  },
  revoked: {
    type: Boolean,
    default: false,
    index: true,
  },
  revokedAt: {
    type: Date,
    default: null,
  },
  replacedByTokenId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RefreshToken',
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 7776000, // Auto-delete after 90 days (in seconds)
  }
});

// CRITICAL INDEXES for high concurrency
RefreshTokenSchema.index({ tokenSelector: 1, revoked: 1 }); // Primary lookup
RefreshTokenSchema.index({ userId: 1, userModel: 1, revoked: 1, expiresAt: 1 }); // User token management
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

// Static method to clean up expired tokens manually (optional - run via cron)
RefreshTokenSchema.statics.cleanupExpiredTokens = async function() {
  const now = new Date();
  const result = await this.deleteMany({
    $or: [
      { expiresAt: { $lt: now } },
      { revoked: true, revokedAt: { $lt: new Date(now - 30 * 24 * 60 * 60 * 1000) } } // Revoked tokens older than 30 days
    ]
  });
  return result.deletedCount;
};

// Static method to revoke all tokens for a user
RefreshTokenSchema.statics.revokeAllForUser = async function(userId, userModel) {
  const result = await this.updateMany(
    { 
      userId: userId, 
      userModel: userModel, 
      revoked: false 
    },
    { 
      $set: { 
        revoked: true, 
        revokedAt: new Date() 
      } 
    }
  );
  return result.modifiedCount;
};

// Static method to count active tokens for a user
RefreshTokenSchema.statics.countActiveForUser = async function(userId, userModel) {
  return await this.countDocuments({
    userId: userId,
    userModel: userModel,
    revoked: false,
    expiresAt: { $gt: new Date() }
  });
};

module.exports = mongoose.model('RefreshToken', RefreshTokenSchema);