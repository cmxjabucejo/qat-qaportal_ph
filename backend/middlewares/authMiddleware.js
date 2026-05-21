const allowedStatuses = ["Active"];

function requireSession(req, res, next) {
  const user = req.session?.user;

  if (
    !user ||
    !user.userEmail ||
    !user.fullName ||
    !user.userLevel ||
    !allowedStatuses.includes(user.userStatus)
  ) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }
  next();
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const sessionUser = req.session?.user;

    if (!sessionUser) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!allowedRoles.includes(sessionUser.userLevel)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }
    next();
  };
}

module.exports = { requireRole, requireSession };
