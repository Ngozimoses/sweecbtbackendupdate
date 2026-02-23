const Joi = require('joi');

const registerSchema = {
  body: Joi.object({
    name: Joi.string().required().max(100).messages({
      'string.empty': 'Name is required',
      'string.max': 'Name cannot exceed 100 characters'
    }),
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email',
      'string.empty': 'Email is required'
    }),
    password: Joi.string().min(6).required().messages({
      'string.min': 'Password must be at least 6 characters',
      'string.empty': 'Password is required'
    }),
    role: Joi.string().valid('admin', 'teacher', 'student').default('student'),
    class: Joi.when('role', {
      is: 'student',
      then: Joi.string().optional(),
      otherwise: Joi.optional()
    })
  })
};

const loginSchema = {
  body: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email',
      'string.empty': 'Email is required'
    }),
    password: Joi.string().required().messages({
      'string.empty': 'Password is required'
    })
  })
};

const forgotPasswordSchema = {
  body: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email',
      'string.empty': 'Email is required'
    })
  })
};

const resetPasswordSchema = {
  params: Joi.object({
    token: Joi.string().required().messages({
      'string.empty': 'Token is required'
    })
  }),
  body: Joi.object({
    password: Joi.string().min(6).required().messages({
      'string.min': 'Password must be at least 6 characters',
      'string.empty': 'Password is required'
    }),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required().messages({
      'any.only': 'Passwords do not match',
      'string.empty': 'Please confirm your password'
    })
  })
};

const updateProfileSchema = {
  body: Joi.object({
    name: Joi.string().max(100).optional(),
    email: Joi.string().email().optional(),
    currentPassword: Joi.string().min(6).optional(),
    newPassword: Joi.string().min(6).optional()
  }).min(1).messages({
    'object.min': 'At least one field must be provided for update'
  })
};

const refreshTokenSchema = {
  body: Joi.object({
    refreshToken: Joi.string().optional()
  })
};

module.exports = {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  refreshTokenSchema
};