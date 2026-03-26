#!/usr/bin/env bash
set -e

# 先切到主分支，确保快照来源正确
git checkout master

# 备份当前 master，防止误操作
git branch "backup-master-$(date +%Y%m%d-%H%M%S)"

# 创建无历史分支并提交当前快照
git checkout --orphan latest
git add -A
git commit -m "chore: keep latest snapshot only"

# 用新分支替换 master
git branch -D master
git branch -m master

# 强推到远程
git push -f origin master