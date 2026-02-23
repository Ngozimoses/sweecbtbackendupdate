const Joi = require('joi');

const registerSchema = {
  body: Joi.object({
    name: Joi.string().required().max(100),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
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
    email: Joi.string().email().required(),
    password: Joi.string().required()
  })
};

const forgotPasswordSchema = {
  body: Joi.object({
    email: Joi.string().email().required()
  })
};

const resetPasswordSchema = {
  params: Joi.object({
    token: Joi.string().required()
  }),
  body: Joi.object({
    password: Joi.string().min(6).required()
  })
};

const updateProfileSchema = {
  body: Joi.object({
    name: Joi.string().max(100).optional(),
    email: Joi.string().email().optional()
  }).min(1)
};

module.exports = {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema
};