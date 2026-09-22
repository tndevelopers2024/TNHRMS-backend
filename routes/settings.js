const express = require('express');
const router = express.Router();
const CompanySettings = require('../models/CompanySettings');

// @route   GET /api/admin/settings/company
// @desc    Get company settings
// @access  Public
router.get('/company', async (req, res) => {
  try {
    let settings = await CompanySettings.findOne();
    if (!settings) {
      // If no settings exist, create a default one
      settings = await CompanySettings.create({});
    }
    res.json(settings);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error fetching company settings' });
  }
});

// @route   PUT /api/admin/settings/company
// @desc    Update company settings
// @access  Public
router.put('/company', async (req, res) => {
  try {
    const { companyName, taxId, address, postalCode, phone, email, logoUrl } = req.body;
    let settings = await CompanySettings.findOne();
    
    if (settings) {
      settings.companyName = companyName !== undefined ? companyName : settings.companyName;
      settings.taxId = taxId !== undefined ? taxId : settings.taxId;
      settings.address = address !== undefined ? address : settings.address;
      settings.postalCode = postalCode !== undefined ? postalCode : settings.postalCode;
      settings.phone = phone !== undefined ? phone : settings.phone;
      settings.email = email !== undefined ? email : settings.email;
      settings.logoUrl = logoUrl !== undefined ? logoUrl : settings.logoUrl;
      await settings.save();
    } else {
      settings = await CompanySettings.create({
        companyName,
        taxId,
        address,
        postalCode,
        phone,
        email,
        logoUrl
      });
    }
    res.json(settings);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error updating company settings' });
  }
});

module.exports = router;
