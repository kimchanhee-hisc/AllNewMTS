function ImageState()
  assert(Hero.imgpath == "initial")
  assert(Hero.visible == true)
  assert(Hero.left == -4)
  assert(Hero.top == 8)
  assert(Hero.width == 32)
  assert(Hero.height == 24)
  Hero.imgpath = "changed"
  Hero.imagetarget = "2"
  Hero.visible = "0"
  Hero.enable = 0
  Hero.left = "-8"
  Hero.top = 12
  Hero.width = "0"
  Hero.height = 48
  Hero.autosize = 1
  Hero.circle = "1"
end

function ImageRollback()
  Hero.imgpath = "rollback-secret"
  error("rollback-secret")
end

function ImageDenied()
  Hero:SetCircleBorder("255:255255255", 1)
end

function ImageBadTarget()
  Hero.imagetarget = 4
end

function ImageBadBoolean()
  Hero.visible = "true"
end

function ImageBadGeometry()
  Hero.left = "08"
end

function ImageBadResource()
  Hero.imgpath = string.char(10)
end
