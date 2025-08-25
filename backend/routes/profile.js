const express = require('express');
const router = express.Router();
const auth=require('../middlewares/auth');
const User = require('../models/User');
const { route } = require('./auth');

// @route   GET api/profile

router.get('/me',auth,async (req,res)=>{
    try{
        const user=await User.findById(req.user.id).select('-password');
        if(!user){
            return res.status(400).json({msg:'User not found'});
        }
        res.json(user);
    }catch(err){
        console.error(err.message);
        res.status(500).send('Server Error');
    }   
});

module.exports = router;