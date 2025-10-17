module.exports = async (req, res) => {
    // This simple function just confirms Vercel can find and execute the file.
    // It will respond with a 200 OK status if successful.
    res.status(200).json({ 
        message: 'Function is reachable!', 
        method: req.method 
    });
};
